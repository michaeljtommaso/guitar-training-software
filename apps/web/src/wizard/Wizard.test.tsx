import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CaptureHandles } from "../capture/controller";

vi.mock("../capture/controller", () => ({
  startCapture: vi.fn(),
}));
vi.mock("../capture/devices", async (orig) => ({
  ...(await orig<typeof import("../capture/devices")>()),
  listCaptureDevices: vi.fn(async () => ({ cameras: [], mics: [] })),
  pickPreferredAudioInput: vi.fn(() => null),
}));

import { Wizard } from "./Wizard";
import { startCapture } from "../capture/controller";
import { listCaptureDevices } from "../capture/devices";
import { useCaptureStore } from "../capture/captureStore";
import { setPerception } from "../perception/perceptionStore";
import { visionHot } from "../perception/perceptionStore";

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
  setPerception({ audio: null });
  visionHot.H = null;
  vi.mocked(startCapture).mockReset();
  vi.mocked(listCaptureDevices).mockReset().mockResolvedValue({ cameras: [], mics: [] });
  try {
    localStorage.clear();
  } catch {
    /* no-op */
  }
});

afterEach(() => {
  resetCaptureStore();
  setPerception({ audio: null });
  visionHot.H = null;
});

async function startAndContinueToStep2(handles: CaptureHandles) {
  vi.mocked(startCapture).mockResolvedValue(handles);
  fireEvent.click(screen.getByTestId("wizard-start-capture"));
  await waitFor(() => expect(screen.getByTestId("wizard-capturing")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("wizard-step1-continue"));
  expect(screen.getByTestId("wizard-step-2")).toBeInTheDocument();
}

describe("Wizard — step 1 (Camera & input, spec §7)", () => {
  it("mounts standalone on step 1 with the first progress dot active", () => {
    render(<Wizard onDone={vi.fn()} />);
    expect(screen.getByTestId("wizard-step-1")).toBeInTheDocument();
    const dots = screen.getByTestId("wizard-progress").querySelectorAll(".wizard-dot");
    expect(dots).toHaveLength(3);
    expect(dots[0].className).toContain("active");
    expect(dots[1].className).not.toContain("active");
  });

  it("Continue is disabled until capture is running", () => {
    render(<Wizard onDone={vi.fn()} />);
    expect(screen.getByTestId("wizard-step1-continue")).toBeDisabled();
  });

  it("Start capture calls startCapture and flips to the running preview + Capturing state", async () => {
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(fakeHandles());
    expect(startCapture).toHaveBeenCalledTimes(1);
  });

  it("shows the two preview panes (full scene + zoom pane preview) once running", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<Wizard onDone={vi.fn()} />);
    fireEvent.click(screen.getByTestId("wizard-start-capture"));
    await waitFor(() => expect(screen.getByTestId("wizard-preview")).not.toHaveAttribute("hidden"));
    expect(screen.getByTestId("wizard-preview-full")).toBeInTheDocument();
    const zoomPane = screen.getByTestId("wizard-preview-zoom").querySelector('[data-testid="zoom-pane"]');
    expect(zoomPane).toBeInTheDocument();
    expect(zoomPane).toHaveAttribute("data-variant", "preview");
  });

  it("shows the 'direct input' badge only when the classified kind is interface", async () => {
    useCaptureStore.setState({ mics: [{ deviceId: "m1", label: "Scarlett 2i2 USB" } as MediaDeviceInfo], micId: "m1" });
    render(<Wizard onDone={vi.fn()} />);
    expect(screen.getByTestId("wizard-direct-input-badge")).toBeInTheDocument();
  });

  it("hides the 'direct input' badge for a built-in microphone", () => {
    useCaptureStore.setState({
      mics: [{ deviceId: "m1", label: "MacBook Pro Microphone" } as MediaDeviceInfo],
      micId: "m1",
    });
    render(<Wizard onDone={vi.fn()} />);
    expect(screen.queryByTestId("wizard-direct-input-badge")).not.toBeInTheDocument();
  });

  it("surfaces a capture error and lets the same Start button retry", async () => {
    useCaptureStore.setState({ phase: "error", error: "Permission denied" });
    render(<Wizard onDone={vi.fn()} />);
    expect(screen.getByTestId("wizard-capture-error")).toHaveTextContent("Permission denied");
    expect(screen.getByTestId("wizard-start-capture")).toBeInTheDocument();
  });
});

describe("Wizard — step 2 (Signal check, spec §7)", () => {
  it("Back returns to step 1, Continue advances to step 3", async () => {
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(fakeHandles());

    fireEvent.click(screen.getByTestId("wizard-step2-back"));
    expect(screen.getByTestId("wizard-step-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("wizard-step1-continue"));
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));
    expect(screen.getByTestId("wizard-step-3")).toBeInTheDocument();
  });

  it("Measure round-trip invokes the running handles and renders the tiered latency-advice line", async () => {
    const handles = fakeHandles({ measureLatency: vi.fn(async () => 8) });
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(handles);

    fireEvent.click(screen.getByTestId("measure-latency"));
    await waitFor(() => expect(handles.measureLatency).toHaveBeenCalledTimes(1));
    const advice = await screen.findByTestId("latency-advice");
    expect(advice.className).toContain("wizard-latency-advice-great");
  });

  it("a high round-trip renders the echo-tier advice", async () => {
    const handles = fakeHandles({ measureLatency: vi.fn(async () => 52) });
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(handles);

    fireEvent.click(screen.getByTestId("measure-latency"));
    const advice = await screen.findByTestId("latency-advice");
    expect(advice.className).toContain("wizard-latency-advice-echo");
  });
});

describe("Wizard — step 3 (You're set, spec §7) + capture-kept-running invariant", () => {
  it("composes the summary from real store/perception state", async () => {
    const cameraList = [{ deviceId: "c1", label: "FaceTime HD Camera" } as MediaDeviceInfo];
    const micList = [{ deviceId: "m1", label: "Scarlett 2i2 USB" } as MediaDeviceInfo];
    vi.mocked(listCaptureDevices).mockResolvedValue({ cameras: cameraList, mics: micList });
    useCaptureStore.setState({
      cameraId: "c1",
      micId: "m1",
      openStringsSeen: 6,
    });
    setPerception({ audio: { framesRead: 0, samplesConsumed: 0, dropped: 0, latencyMs: 0, health: { rmsDb: -18, peakDb: -10, noiseFloorDb: -62, clipped: false } } });

    const handles = fakeHandles({ measureLatency: vi.fn(async () => 34) });
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(handles);
    fireEvent.click(screen.getByTestId("measure-latency"));
    await waitFor(() => expect(handles.measureLatency).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));
    // OpenStringCheck owns `openStringsSeen` only while mounted (step 2) — set
    // the "6 strings confirmed" outcome now that it has unmounted, so this
    // assertion reflects Wizard's read of the store, not a value the
    // just-unmounted component would immediately clobber.
    fireEvent.click(screen.getByTestId("wizard-step3-back"));
    useCaptureStore.setState({ openStringsSeen: 6 });
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));

    expect(screen.getByTestId("wizard-summary-camera")).toHaveTextContent("FaceTime HD Camera — full scene");
    expect(screen.getByTestId("wizard-summary-zoom")).toHaveTextContent("uncalibrated");
    expect(screen.getByTestId("wizard-summary-input")).toHaveTextContent("Scarlett 2i2 USB · direct input · -18 dB");
    expect(screen.getByTestId("wizard-summary-open-strings")).toHaveTextContent("open strings 6/6 · ~34 ms round trip");
  });

  it("shows 'calibrated' once a fretboard homography is held", async () => {
    visionHot.H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(fakeHandles());
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));
    expect(screen.getByTestId("wizard-summary-zoom")).toHaveTextContent("calibrated");
    expect(screen.getByTestId("wizard-summary-zoom")).not.toHaveTextContent("uncalibrated");
  });

  it("Start practicing sets gt-setup-done and calls onDone WITHOUT stopping capture", async () => {
    const onDone = vi.fn();
    const handles = fakeHandles();
    render(<Wizard onDone={onDone} />);
    await startAndContinueToStep2(handles);
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));
    fireEvent.click(screen.getByTestId("wizard-start-practicing"));

    expect(localStorage.getItem("gt-setup-done")).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(handles.stop).not.toHaveBeenCalled();
  });

  it("Back from step 3 returns to step 2", async () => {
    render(<Wizard onDone={vi.fn()} />);
    await startAndContinueToStep2(fakeHandles());
    fireEvent.click(screen.getByTestId("wizard-step2-continue"));
    fireEvent.click(screen.getByTestId("wizard-step3-back"));
    expect(screen.getByTestId("wizard-step-2")).toBeInTheDocument();
  });
});

describe("Wizard — skip path (spec §5/§7)", () => {
  it("skip setup for now sets gt-setup-done and calls onDone from step 1, without stopping capture", async () => {
    const onDone = vi.fn();
    const handles = fakeHandles();
    render(<Wizard onDone={onDone} />);
    await startAndContinueToStep2(handles); // capture running, still mid-wizard

    fireEvent.click(screen.getByTestId("wizard-skip"));
    expect(localStorage.getItem("gt-setup-done")).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(handles.stop).not.toHaveBeenCalled();
  });

  it("skip works even before capture has ever started", () => {
    const onDone = vi.fn();
    render(<Wizard onDone={onDone} />);
    fireEvent.click(screen.getByTestId("wizard-skip"));
    expect(localStorage.getItem("gt-setup-done")).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
