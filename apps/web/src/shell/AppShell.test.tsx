import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CaptureHandles } from "../capture/controller";
import type { ToneChainHandles } from "../tone/toneChain";

// The shell wires the REAL v2 chrome (Wizard, PracticeScreen, TopBar, HintBar,
// TelemetryFooter, ConsoleDrawer, ZoomPane). Only the capture boundary and the
// canvas-heavy OverlayCanvas are stubbed so this suite exercises the actual
// wiring — routing, capture continuity, footer/drawer behavior — in jsdom.
vi.mock("../overlay/OverlayCanvas", () => ({
  OverlayCanvas: () => <div data-testid="overlay-canvas-stub" />,
}));
vi.mock("../capture/controller", () => ({
  startCapture: vi.fn(),
  MANUAL_TAP_ORDER: [
    { label: "nut · low E (6th)", dst: { x: 0, y: 0 } },
    { label: "nut · high e (1st)", dst: { x: 0, y: 1 } },
    { label: "5th fret · high e (1st)", dst: { x: 1, y: 1 } },
    { label: "5th fret · low E (6th)", dst: { x: 1, y: 0 } },
  ],
}));
vi.mock("../capture/devices", async (orig) => ({
  ...(await orig<typeof import("../capture/devices")>()),
  listCaptureDevices: vi.fn(async () => ({ cameras: [], mics: [] })),
  pickPreferredAudioInput: vi.fn(() => null),
}));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig<typeof import("../theory/chords")>()),
  chordSuffixes: vi.fn(async () => ["major", "minor"]),
}));

import { AppShell } from "./AppShell";
import { startCapture } from "../capture/controller";
import { useCaptureStore } from "../capture/captureStore";

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
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  resetCaptureStore();
  vi.mocked(startCapture).mockReset();
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  resetCaptureStore();
});

/** Drive the real Wizard from step 1 (capture running) through to
 *  "Start practicing". Assumes startCapture is already mocked. */
async function walkWizardToPractice() {
  fireEvent.click(screen.getByTestId("wizard-start-capture"));
  await waitFor(() => expect(screen.getByTestId("wizard-capturing")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("wizard-step1-continue"));
  fireEvent.click(screen.getByTestId("wizard-step2-continue"));
  fireEvent.click(screen.getByTestId("wizard-start-practicing"));
}

describe("AppShell — routing (gt-setup-done) + full wiring (spec §5)", () => {
  it("renders the real Wizard (no practice chrome) when setup is NOT done, with the drawer mounted", () => {
    render(<AppShell />);
    expect(screen.getByTestId("route-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("route-practice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topbar")).not.toBeInTheDocument();
    // The console drawer is hosted by AppShell on both routes (spec §5).
    expect(screen.getByTestId("console-drawer")).toBeInTheDocument();
  });

  it("renders the PracticeScreen with every slot wired when setup IS done", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    expect(screen.getByTestId("route-practice")).toBeInTheDocument();
    expect(screen.getByTestId("practice-screen")).toBeInTheDocument();
    expect(screen.getByTestId("topbar")).toBeInTheDocument();
    expect(screen.getByTestId("hint-bar")).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-footer")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-pane")).toBeInTheDocument(); // real ZoomPane, not the placeholder
    expect(screen.getByTestId("coach-column")).toBeInTheDocument();
    expect(screen.getByTestId("console-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("route-wizard")).not.toBeInTheDocument();
  });

  it("skipped wizard → practice screen shows the start-capture card (spec §9)", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    expect(screen.getByTestId("capture-start-card")).toBeInTheDocument();
  });
});

describe("AppShell — capture continuity across Wizard → PracticeScreen (spec §7, T6)", () => {
  it("finishing the wizard keeps capture running: same startCapture call, same video element, stop() never called", async () => {
    const handles = fakeHandles();
    vi.mocked(startCapture).mockResolvedValue(handles);
    render(<AppShell />);

    await walkWizardToPractice();

    // Route swapped…
    expect(screen.getByTestId("route-practice")).toBeInTheDocument();
    // …capture was started exactly once and NEVER stopped across the swap.
    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(handles.stop).not.toHaveBeenCalled();
    expect(useCaptureStore.getState().phase).toBe("running");

    // The SAME video element startCapture wired up is now mounted inside the
    // practice screen's camera pane — moved, not re-created.
    const video = vi.mocked(startCapture).mock.calls[0][0];
    expect(screen.getByTestId("video-stage").contains(video)).toBe(true);
    expect(document.querySelectorAll("video")).toHaveLength(1);
    // Running capture → the camera pane is live (overlay mounted, no start card).
    expect(screen.getByTestId("overlay-canvas-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-start-card")).not.toBeInTheDocument();
  });

  it("the drawer receives the live handles after the wizard finishes (tone section enabled)", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<AppShell />);
    await walkWizardToPractice();

    const toneSection = screen.getByTestId("console-section-tone");
    expect(toneSection.querySelector("#tone-monitor")).toBeTruthy();
    expect(toneSection).not.toHaveTextContent("Start capture to enable tone controls");
  });

  it("wires tone-chain latency from the live handles into the telemetry footer (T2 handoff)", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<AppShell />);
    await walkWizardToPractice();

    expect(screen.getByTestId("telemetry-footer-line")).toHaveTextContent("tone");
    expect(screen.getByTestId("telemetry-footer-line")).toHaveTextContent("5.8 ms");
  });

  it("drawer stop-capture goes through the host: handles stopped, phase idle, camera pane shows the start card", async () => {
    const handles = fakeHandles();
    vi.mocked(startCapture).mockResolvedValue(handles);
    render(<AppShell />);
    await walkWizardToPractice();

    fireEvent.click(screen.getByTestId("console-stop-capture"));
    expect(handles.stop).toHaveBeenCalledTimes(1);
    expect(useCaptureStore.getState().phase).toBe("idle");
    expect(screen.getByTestId("capture-start-card")).toBeInTheDocument();
  });

  it("drawer restart control starts capture on the current selection via the host", async () => {
    localStorage.setItem("gt-setup-done", "true");
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<AppShell />);

    fireEvent.click(screen.getByTestId("console-restart-capture"));
    await waitFor(() => expect(useCaptureStore.getState().phase).toBe("running"));
    expect(startCapture).toHaveBeenCalledTimes(1);
  });
});

describe("AppShell — footer `setup wizard` link (spec §3/§9)", () => {
  it("returns to the wizard, clears gt-setup-done, and closes the drawer", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);

    // Open the drawer first so the §9 rule (entering the wizard closes it) is observable.
    fireEvent.click(screen.getByTestId("topbar-console-toggle"));
    expect(screen.getByTestId("console-drawer")).toHaveAttribute("data-open", "true");

    fireEvent.click(screen.getByTestId("telemetry-footer-wizard"));
    expect(screen.getByTestId("route-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("route-practice")).not.toBeInTheDocument();
    expect(localStorage.getItem("gt-setup-done")).toBeNull();
    expect(screen.getByTestId("console-drawer")).toHaveAttribute("data-open", "false");
  });

  it("finishing the wizard again returns to practice (round trip)", async () => {
    localStorage.setItem("gt-setup-done", "true");
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<AppShell />);

    fireEvent.click(screen.getByTestId("telemetry-footer-wizard"));
    expect(screen.getByTestId("route-wizard")).toBeInTheDocument();

    await walkWizardToPractice();
    expect(screen.getByTestId("route-practice")).toBeInTheDocument();
    expect(localStorage.getItem("gt-setup-done")).toBe("true");
  });
});

describe("AppShell — theme (default dark + persistence, spec §1.4)", () => {
  it("defaults to dark on first load", () => {
    render(<AppShell />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles theme from the TopBar and persists the choice", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    const toggle = screen.getByTestId("topbar-theme-toggle");

    fireEvent.click(toggle); // dark -> light
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("gt-theme")).toBe("light");

    fireEvent.click(toggle); // light -> dark
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("gt-theme")).toBe("dark");
  });

  it("respects a saved light preference on load", () => {
    localStorage.setItem("gt-theme", "light");
    render(<AppShell />);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});

describe("AppShell — console drawer state (via ConsoleDrawer's own guarded handler)", () => {
  it("toggles the drawer on backtick and closes on Escape", () => {
    render(<AppShell />);
    const drawer = screen.getByTestId("console-drawer");
    expect(drawer).toHaveAttribute("data-open", "false");

    fireEvent.keyDown(window, { key: "`" });
    expect(drawer).toHaveAttribute("data-open", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer).toHaveAttribute("data-open", "false");
  });

  it("backtick does NOT toggle while typing in a form control (T2 review fix, now live in the shell)", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    const textarea = screen.getByLabelText("Question for the coach");
    textarea.focus();
    fireEvent.keyDown(textarea, { key: "`" });
    expect(screen.getByTestId("console-drawer")).toHaveAttribute("data-open", "false");
  });

  it("TopBar and footer console buttons both toggle the drawer", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    fireEvent.click(screen.getByTestId("topbar-console-toggle"));
    expect(screen.getByTestId("console-drawer")).toHaveAttribute("data-open", "true");
    fireEvent.click(screen.getByTestId("telemetry-footer-console"));
    expect(screen.getByTestId("console-drawer")).toHaveAttribute("data-open", "false");
  });
});
