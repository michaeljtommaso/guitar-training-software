import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { CaptureHandles } from "../capture/controller";

vi.mock("../capture/controller", () => ({
  startCapture: vi.fn(),
}));
vi.mock("../capture/devices", async (orig) => ({
  ...(await orig<typeof import("../capture/devices")>()),
  listCaptureDevices: vi.fn(async () => ({ cameras: [], mics: [] })),
  pickPreferredAudioInput: vi.fn(() => null),
}));

import { useCaptureHost } from "./useCaptureHost";
import { VideoMount } from "./VideoMount";
import { startCapture } from "../capture/controller";
import { listCaptureDevices, pickPreferredAudioInput } from "../capture/devices";
import { useCaptureStore } from "../capture/captureStore";

function fakeHandles(overrides: Partial<CaptureHandles> = {}): CaptureHandles {
  return {
    stream: {} as MediaStream,
    stop: vi.fn(),
    setManualCalibration: vi.fn(),
    calibrateCharuco: vi.fn(async () => 0),
    clearCalibration: vi.fn(),
    tone: {} as CaptureHandles["tone"],
    measureLatency: vi.fn(async () => null),
    ...overrides,
  };
}

function resetCaptureStore() {
  useCaptureStore.setState({
    cameras: [],
    mics: [],
    cameraId: "",
    micId: "",
    phase: "idle",
    error: null,
    inputMeta: null,
    openStringsSeen: 0,
  });
}

beforeEach(() => {
  resetCaptureStore();
  vi.mocked(startCapture).mockReset();
  vi.mocked(listCaptureDevices).mockReset().mockResolvedValue({ cameras: [], mics: [] });
  vi.mocked(pickPreferredAudioInput).mockReset().mockReturnValue(null);
});
afterEach(() => {
  resetCaptureStore();
});

describe("useCaptureHost — video element ownership", () => {
  it("creates one muted/autoplay/inline video element and keeps it stable across renders", () => {
    const { result, rerender } = renderHook(() => useCaptureHost());
    const video = result.current.video;
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
    rerender();
    expect(result.current.video).toBe(video);
  });
});

describe("useCaptureHost — start/stop (lifted SetupWizard behavior)", () => {
  it("start() runs startCapture on the host video and transitions to running with live handles", async () => {
    const handles = fakeHandles();
    vi.mocked(startCapture).mockResolvedValue(handles);
    const { result } = renderHook(() => useCaptureHost());

    await act(() => result.current.start("", ""));

    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startCapture).mock.calls[0][0]).toBe(result.current.video);
    expect(result.current.handles).toBe(handles);
    expect(result.current.videoEl).toBe(result.current.video);
    expect(useCaptureStore.getState().phase).toBe("running");
  });

  it("start() while running stops the previous handles first (device-change restart)", async () => {
    const first = fakeHandles();
    const second = fakeHandles();
    vi.mocked(startCapture).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result } = renderHook(() => useCaptureHost());

    await act(() => result.current.start("", "mic-a"));
    await act(() => result.current.start("", "mic-b"));

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).not.toHaveBeenCalled();
    expect(result.current.handles).toBe(second);
  });

  it("auto-prefers a direct-input interface once on first run (ADR-013)", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    vi.mocked(pickPreferredAudioInput).mockReturnValueOnce({
      deviceId: "iface-1",
      label: "Scarlett 2i2 USB",
    } as MediaDeviceInfo);
    const { result } = renderHook(() => useCaptureHost());

    await act(() => result.current.start("", ""));

    expect(startCapture).toHaveBeenCalledTimes(2); // default start, then interface restart
    expect(useCaptureStore.getState().micId).toBe("iface-1");
    expect(useCaptureStore.getState().phase).toBe("running");
  });

  it("retries once on system defaults when a stale persisted device throws OverconstrainedError", async () => {
    const err = new Error("device gone");
    err.name = "OverconstrainedError";
    vi.mocked(startCapture).mockRejectedValueOnce(err).mockResolvedValueOnce(fakeHandles());
    useCaptureStore.setState({ cameraId: "stale-cam", micId: "stale-mic" });
    const { result } = renderHook(() => useCaptureHost());

    await act(() => result.current.start("stale-cam", "stale-mic"));

    expect(startCapture).toHaveBeenCalledTimes(2);
    expect(useCaptureStore.getState().cameraId).toBe("");
    expect(useCaptureStore.getState().phase).toBe("running");
  });

  it("surfaces other start errors as phase=error", async () => {
    vi.mocked(startCapture).mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useCaptureHost());

    await act(() => result.current.start("", ""));

    expect(useCaptureStore.getState().phase).toBe("error");
    expect(useCaptureStore.getState().error).toBe("Permission denied");
    expect(result.current.handles).toBeNull();
  });

  it("stop() stops the handles, clears them, resets phase and calibration UI", async () => {
    const handles = fakeHandles();
    vi.mocked(startCapture).mockResolvedValue(handles);
    const { result } = renderHook(() => useCaptureHost());
    await act(() => result.current.start("", ""));
    act(() => result.current.toggleCalibMode());
    expect(result.current.calibMode).toBe(true);

    act(() => result.current.stop());

    expect(handles.stop).toHaveBeenCalledTimes(1);
    expect(result.current.handles).toBeNull();
    expect(result.current.videoEl).toBeNull();
    expect(result.current.calibMode).toBe(false);
    expect(useCaptureStore.getState().phase).toBe("idle");
  });
});

describe("useCaptureHost — calibration (lifted SetupWizard behavior)", () => {
  async function runningHost() {
    const handles = fakeHandles();
    vi.mocked(startCapture).mockResolvedValue(handles);
    const hook = renderHook(() => useCaptureHost());
    await act(() => hook.result.current.start("", ""));
    return { hook, handles };
  }

  it("four taps solve + apply the manual calibration and exit calib mode", async () => {
    const { hook, handles } = await runningHost();
    act(() => hook.result.current.toggleCalibMode());
    const taps = [
      { x: 0.1, y: 0.8 },
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.8 },
    ];
    for (const t of taps) act(() => hook.result.current.tapCalibration(t));

    expect(handles.setManualCalibration).toHaveBeenCalledWith(taps);
    expect(hook.result.current.calibMode).toBe(false);
    expect(hook.result.current.calibMsg).toContain("Calibrated from 4 taps");
  });

  it("taps outside calib mode are ignored", async () => {
    const { hook, handles } = await runningHost();
    act(() => hook.result.current.tapCalibration({ x: 0.5, y: 0.5 }));
    expect(hook.result.current.taps).toHaveLength(0);
    expect(handles.setManualCalibration).not.toHaveBeenCalled();
  });

  it("detectCharuco reports corner count / not-found through calibMsg", async () => {
    const { hook } = await runningHost();
    await act(() => hook.result.current.detectCharuco());
    expect(hook.result.current.calibMsg).toContain("No ChArUco board detected");
  });

  it("clearCalibration calls through and resets calib UI", async () => {
    const { hook, handles } = await runningHost();
    act(() => hook.result.current.toggleCalibMode());
    act(() => hook.result.current.clearCalibration());
    expect(handles.clearCalibration).toHaveBeenCalledTimes(1);
    expect(hook.result.current.calibMode).toBe(false);
    expect(hook.result.current.calibMsg).toBe("Calibration cleared.");
  });
});

describe("VideoMount — moving the singleton element between screens", () => {
  it("appends the host video into its container and MOVES (not clones) it on remount", () => {
    const { result } = renderHook(() => useCaptureHost());
    const video = result.current.video;

    const first = render(<VideoMount video={video} />);
    expect(screen.getByTestId("video-mount").contains(video)).toBe(true);

    first.unmount();
    render(<VideoMount video={video} />);
    expect(screen.getByTestId("video-mount").contains(video)).toBe(true);
    // Same DOM node, never re-created — this IS the capture-continuity mechanism.
    expect(document.querySelectorAll("video")).toHaveLength(1);
  });

  it("re-issues play() on attach (once a stream is live) so a move-induced pause resumes", async () => {
    const { result } = renderHook(() => useCaptureHost());
    const video = result.current.video;
    Object.defineProperty(video, "srcObject", { value: {}, configurable: true });
    const play = vi.spyOn(video, "play").mockResolvedValue(undefined);
    render(<VideoMount video={video} />);
    await waitFor(() => expect(play).toHaveBeenCalled());
  });
});
