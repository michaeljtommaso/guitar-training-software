import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CaptureHandles } from "../capture/controller";

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
vi.mock("../capture/devices", () => ({
  listCaptureDevices: vi.fn(async () => ({ cameras: [], mics: [] })),
  pickPreferredAudioInput: vi.fn(() => null),
  classifyAudioInput: () => "unknown",
}));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 },
  ]),
  chordSuffixes: vi.fn(async () => ["major", "minor"]),
}));

import {
  PracticeScreen,
  fingeringSpelling,
  voicingSpelling,
  deriveTargetCard,
  type TargetCardData,
} from "./PracticeScreen";
import { startCapture } from "../capture/controller";
import { useCaptureStore } from "../capture/captureStore";
import { useExploreStore } from "../explore/exploreStore";
import { startLesson, stopLesson } from "../fusion/fusionStore";
import { getLesson } from "../fusion/lessons";
import type { Voicing } from "../theory/chords";

function fakeHandles(): CaptureHandles {
  return {
    stream: {} as MediaStream,
    stop: vi.fn(),
    setManualCalibration: vi.fn(),
    calibrateCharuco: vi.fn(async () => 0),
    clearCalibration: vi.fn(),
    tone: {} as CaptureHandles["tone"],
    measureLatency: vi.fn(async () => null),
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
  useExploreStore.getState().setMode("practice");
  vi.mocked(startCapture).mockReset();
});
afterEach(() => {
  resetCaptureStore();
  stopLesson();
  useExploreStore.getState().setMode("practice");
});

describe("PracticeScreen — pure helpers", () => {
  it("fingeringSpelling derives the standard low→high spelling from a lesson step (spec §5 example)", () => {
    const step = getLesson("open_chords_c_major")!.steps[0];
    expect(fingeringSpelling(step)).toBe("x 3 2 0 1 0");
  });

  it("voicingSpelling reverses a Voicing's frets (string1-first) into low→high display order", () => {
    const voicing: Voicing = {
      frets: [0, 1, 2, 2, 0, -1],
      fingers: [0, 1, 3, 2, 0, 0],
      barres: [],
      baseFret: 1,
      window: [0, 4],
      difficulty: 13,
    };
    expect(voicingSpelling(voicing)).toBe("x 0 2 2 1 0");
  });

  it("deriveTargetCard: practice mode with no active lesson → null", () => {
    expect(deriveTargetCard("practice", { lessonId: null, stepIndex: 0, targetChord: null }, null)).toBeNull();
  });

  it("deriveTargetCard: practice mode with an active lesson → chord name + fingering spelling", () => {
    const data = deriveTargetCard(
      "practice",
      { lessonId: "open_chords_c_major", stepIndex: 0, targetChord: "C" },
      null,
    );
    expect(data).toEqual<TargetCardData>({ name: "C", spelling: "x 3 2 0 1 0" });
  });

  it("deriveTargetCard: explore chord target → short chord name + voicing spelling", () => {
    const voicing: Voicing = { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 };
    const data = deriveTargetCard("explore", { lessonId: null, stepIndex: 0, targetChord: null }, {
      kind: "chord",
      root: "A",
      suffix: "minor",
      voicings: [voicing],
      active: 0,
    });
    expect(data).toEqual<TargetCardData>({ name: "Am", spelling: "x 0 2 2 1 0" });
  });

  it("deriveTargetCard: explore scale target → root+scale name, no spelling", () => {
    const data = deriveTargetCard("explore", { lessonId: null, stepIndex: 0, targetChord: null }, {
      kind: "scale",
      root: "G",
      scaleType: "major",
      positions: [],
    });
    expect(data).toEqual<TargetCardData>({ name: "G major scale", spelling: null });
  });

  it("deriveTargetCard: explore mode with no target yet → null", () => {
    expect(deriveTargetCard("explore", { lessonId: null, stepIndex: 0, targetChord: null }, null)).toBeNull();
  });
});

describe("PracticeScreen — camera pane edge states (spec §9)", () => {
  it("capture not running (skipped wizard) shows the start-capture card with device selects + start button", () => {
    render(<PracticeScreen />);
    expect(screen.getByTestId("capture-start-card")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Microphone")).toBeInTheDocument();
    expect(screen.getByTestId("capture-start")).toBeInTheDocument();
    expect(screen.queryByTestId("calibrate-button")).not.toBeInTheDocument();
  });

  it("clicking start capture calls startCapture and transitions into the running camera view", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    render(<PracticeScreen />);
    fireEvent.click(screen.getByTestId("capture-start"));

    await waitFor(() => expect(screen.getByTestId("overlay-canvas-stub")).toBeInTheDocument());
    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("capture-start-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("calibrate-button")).toBeInTheDocument();
  });

  it("device/permission error surfaces a token-styled error card with retry", () => {
    useCaptureStore.getState().setPhase("error", "Permission denied");
    render(<PracticeScreen />);
    expect(screen.getByTestId("capture-error-card")).toBeInTheDocument();
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
    expect(screen.getByTestId("capture-retry")).toBeInTheDocument();
  });

  it("retry re-invokes startCapture", async () => {
    vi.mocked(startCapture).mockResolvedValue(fakeHandles());
    useCaptureStore.getState().setPhase("error", "Permission denied");
    render(<PracticeScreen />);
    fireEvent.click(screen.getByTestId("capture-retry"));
    await waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
  });
});

describe("PracticeScreen — camera pane overlays while running (spec §5)", () => {
  beforeEach(() => {
    useCaptureStore.setState({ phase: "running" });
  });

  it("toggling the calibrate ghost button enters tap mode and shows the tap hint", () => {
    render(<PracticeScreen />);
    fireEvent.click(screen.getByTestId("calibrate-button"));
    expect(screen.getByTestId("calibrate-tap-hint")).toHaveTextContent("nut · low E (6th) (0/4)");
    fireEvent.click(screen.getByTestId("calibrate-button"));
    expect(screen.queryByTestId("calibrate-tap-hint")).not.toBeInTheDocument();
  });

  it("no active lesson/explore target → no target card, no string chips", () => {
    render(<PracticeScreen />);
    expect(screen.queryByTestId("target-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("string-chips")).not.toBeInTheDocument();
  });

  it("an active practice lesson renders the target card + per-string chips", () => {
    startLesson("open_chords_c_major");
    render(<PracticeScreen />);
    const card = screen.getByTestId("target-card");
    expect(card).toHaveTextContent("C");
    expect(card).toHaveTextContent("x 3 2 0 1 0");

    const chips = screen.getByTestId("string-chips");
    expect(chips.querySelectorAll(".camera-chip")).toHaveLength(6);
  });

  it("explore mode with a chord target renders the target card but NOT string chips", async () => {
    useExploreStore.getState().setMode("explore");
    await useExploreStore.getState().setChord("A", "minor");
    render(<PracticeScreen />);
    await waitFor(() => expect(screen.getByTestId("target-card")).toHaveTextContent("Am"));
    expect(screen.queryByTestId("string-chips")).not.toBeInTheDocument();
  });
});

describe("PracticeScreen — grid slots (spec §5)", () => {
  it("renders a zoom-pane placeholder mount point when no zoomPane prop is given", () => {
    render(<PracticeScreen />);
    expect(screen.getByTestId("zoom-pane")).toBeInTheDocument();
  });

  it("renders a caller-provided zoomPane instead of the placeholder", () => {
    render(<PracticeScreen zoomPane={<div data-testid="real-zoom-pane" />} />);
    expect(screen.getByTestId("real-zoom-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("zoom-pane")).not.toBeInTheDocument();
  });

  it("renders optional topBar/hintBar/footer slots when provided", () => {
    render(
      <PracticeScreen
        topBar={<div data-testid="fake-topbar" />}
        hintBar={<div data-testid="fake-hintbar" />}
        footer={<div data-testid="fake-footer" />}
      />,
    );
    expect(screen.getByTestId("fake-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("fake-hintbar")).toBeInTheDocument();
    expect(screen.getByTestId("fake-footer")).toBeInTheDocument();
  });

  it("mounts the CoachColumn as the persistent right-hand column", () => {
    render(<PracticeScreen />);
    expect(screen.getByTestId("coach-column")).toBeInTheDocument();
  });

  it("mounts standalone without any slot props (parallel tasks not required)", () => {
    expect(() => render(<PracticeScreen />)).not.toThrow();
    expect(screen.getByTestId("practice-screen")).toBeInTheDocument();
  });
});
