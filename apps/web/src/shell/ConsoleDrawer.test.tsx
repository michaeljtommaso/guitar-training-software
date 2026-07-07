import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsoleDrawer, isEditableTarget } from "./ConsoleDrawer";
import { useCaptureStore } from "../capture/captureStore";
import type { CaptureHandles } from "../capture/controller";
import type { ToneChainHandles } from "../tone/toneChain";

function fakeHandles(overrides: Partial<CaptureHandles> = {}): CaptureHandles {
  const tone: ToneChainHandles = {
    setParams: vi.fn(),
    loadIR: vi.fn(async () => {}),
    resetIR: vi.fn(async () => {}),
    latencyMs: () => 5.8,
    outputRms: () => 0,
    dispose: vi.fn(),
  };
  return {
    stream: {} as MediaStream,
    stop: vi.fn(),
    setManualCalibration: vi.fn(),
    calibrateCharuco: vi.fn(async () => 0),
    clearCalibration: vi.fn(),
    tone,
    measureLatency: vi.fn(async () => 8),
    ...overrides,
  };
}

describe("isEditableTarget", () => {
  it("flags inputs/textareas/selects/contenteditable, nothing else", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    expect(isEditableTarget(ce)).toBe(true);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("ConsoleDrawer", () => {
  beforeEach(() => {
    useCaptureStore.setState({ mics: [], micId: "", cameras: [], cameraId: "" });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four sections and is hidden via the `hidden` attribute when closed", () => {
    render(<ConsoleDrawer open={false} onOpenChange={vi.fn()} handles={null} />);
    const drawer = screen.getByTestId("console-drawer");
    expect(drawer).not.toBeVisible();
    expect(screen.getByTestId("console-section-audio")).toBeInTheDocument();
    expect(screen.getByTestId("console-section-tone")).toBeInTheDocument();
    expect(screen.getByTestId("console-section-system")).toBeInTheDocument();
    expect(screen.getByTestId("console-section-inputs")).toBeInTheDocument();
  });

  it("is visible when open", () => {
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={null} />);
    expect(screen.getByTestId("console-drawer")).toBeVisible();
  });

  it("Tone section shows a no-capture fallback (no fake controls) when handles is null", () => {
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={null} />);
    expect(screen.getByTestId("console-section-tone")).toHaveTextContent("Start capture to enable tone controls");
  });

  it("mounts the real TonePanel (minus its preset dropdown) once handles is live", () => {
    const handles = fakeHandles();
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={handles} />);
    const toneSection = screen.getByTestId("console-section-tone");
    // TonePanel's own monitor select is present (real component, not a stub)...
    expect(toneSection.querySelector("#tone-monitor")).toBeTruthy();
    // ...but the preset dropdown lives in TopBar now — hidden here (spec §3).
    expect(toneSection.className).toContain("console-section--hide-preset");
    expect(toneSection.querySelector("#tone-preset")).toBeTruthy(); // still mounted, just hidden
  });

  it("re-run round-trip probe calls handles.measureLatency and shows advice", async () => {
    const handles = fakeHandles({ measureLatency: vi.fn(async () => 8) });
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={handles} />);
    fireEvent.click(screen.getByTestId("console-measure-latency"));
    await waitFor(() => expect(handles.measureLatency).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("console-latency-advice")).toBeInTheDocument());
  });

  it("re-run probe button is disabled without live handles", () => {
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={null} />);
    expect(screen.getByTestId("console-measure-latency")).toBeDisabled();
  });

  it("stop capture calls handles.stop(), resets captureStore phase, and fires onStopCapture", () => {
    const handles = fakeHandles();
    useCaptureStore.setState({ phase: "running" });
    const onStopCapture = vi.fn();
    render(<ConsoleDrawer open onOpenChange={vi.fn()} handles={handles} onStopCapture={onStopCapture} />);
    fireEvent.click(screen.getByTestId("console-stop-capture"));
    expect(handles.stop).toHaveBeenCalledTimes(1);
    expect(useCaptureStore.getState().phase).toBe("idle");
    expect(onStopCapture).toHaveBeenCalledTimes(1);
  });

  describe("key handling (review fix: backtick must not fire in editable elements)", () => {
    it("backtick toggles the drawer when focus is NOT in an editable element", () => {
      const onOpenChange = vi.fn();
      render(<ConsoleDrawer open={false} onOpenChange={onOpenChange} handles={null} />);
      fireEvent.keyDown(window, { key: "`" });
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it("backtick does NOT toggle the drawer while typing in an input/textarea", () => {
      const onOpenChange = vi.fn();
      render(
        <div>
          <ConsoleDrawer open={false} onOpenChange={onOpenChange} handles={null} />
          <textarea data-testid="somewhere-else" />
        </div>,
      );
      const textarea = screen.getByTestId("somewhere-else");
      textarea.focus();
      fireEvent.keyDown(textarea, { key: "`" });
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("Escape always closes, even from an editable element", () => {
      const onOpenChange = vi.fn();
      render(
        <div>
          <ConsoleDrawer open onOpenChange={onOpenChange} handles={null} />
          <textarea data-testid="somewhere-else" />
        </div>,
      );
      const textarea = screen.getByTestId("somewhere-else");
      textarea.focus();
      fireEvent.keyDown(textarea, { key: "Escape" });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("enableHotkey=false lets a caller own key handling instead", () => {
      const onOpenChange = vi.fn();
      render(<ConsoleDrawer open={false} onOpenChange={onOpenChange} handles={null} enableHotkey={false} />);
      fireEvent.keyDown(window, { key: "`" });
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
