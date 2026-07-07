import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FusionSnapshot } from "../fusion/fusionStore";

// HintBar is a pure presentation of the fusion snapshot (spec §3/§5 — same
// data LessonPanel already reads). Mock the store boundary so this suite
// exercises HintBar's own rendering/formatting logic deterministically,
// independent of the real fusion engine (that engine has its own test suite).
const flagTipWrong = vi.fn();
let snapshot: FusionSnapshot;
vi.mock("../fusion/fusionStore", () => ({
  getFusionSnapshot: () => snapshot,
  subscribeFusion: () => () => {},
  flagTipWrong: (...args: unknown[]) => flagTipWrong(...args),
}));

import { HintBar } from "./HintBar";
import { fusionHintHistogram } from "../observability/latencyHistogram";

const emptySnapshot = (): FusionSnapshot => ({
  lessonId: null,
  lessonTitle: null,
  stepIndex: 0,
  stepCount: 0,
  targetChord: null,
  hint: null,
  lastDiagnosis: null,
  stringStatus: null,
  counts: { diagnoses: 0, hints: 0, dropped: 0, evaluations: 0, complaints: 0 },
  hintLatencyMs: [],
  evalLatencyMs: [],
});

describe("HintBar", () => {
  beforeEach(() => {
    snapshot = emptySnapshot();
    flagTipWrong.mockClear();
    fusionHintHistogram.reset();
  });

  it("shows the idle prompt when no lesson is active, tip-wrong disabled", () => {
    render(<HintBar />);
    expect(screen.getByTestId("hint-bar-text")).toHaveTextContent("Start a lesson");
    expect(screen.getByTestId("hint-bar-tip-wrong")).toBeDisabled();
    expect(screen.queryByTestId("hint-bar-subline")).not.toBeInTheDocument();
  });

  it("shows a listening placeholder once a lesson is active but no hint has fired yet", () => {
    snapshot = { ...emptySnapshot(), lessonId: "open_chords_c_major", lessonTitle: "C major", stepCount: 1 };
    render(<HintBar />);
    expect(screen.getByTestId("hint-bar-text")).toHaveTextContent("Listening");
    expect(screen.getByTestId("hint-bar-tip-wrong")).toBeDisabled();
  });

  it("renders the active hint text verbatim", () => {
    snapshot = {
      ...emptySnapshot(),
      lessonId: "open_chords_c_major",
      hint: { t: 0, code: "muted_string", text: "A string is muted — G", hedged: false, conf: 0.8, severity: 0.5 },
    };
    render(<HintBar />);
    expect(screen.getByTestId("hint-bar-text")).toHaveTextContent("A string is muted — G");
  });

  it("composes the mono subline from lastDiagnosis + the hint-latency histogram", () => {
    fusionHintHistogram.record(61.4);
    snapshot = {
      ...emptySnapshot(),
      lessonId: "open_chords_c_major",
      lastDiagnosis: {
        t: 0,
        code: "ok",
        target: { lessonId: "open_chords_c_major", step: 0, chord: "C" },
        evidence: { audio: "C · 91%", vision: "shape ok" },
        severity: 0,
        conf: 0.91,
      },
    };
    render(<HintBar />);
    const subline = screen.getByTestId("hint-bar-subline");
    expect(subline).toHaveTextContent("ok · conf 91% · hint p50 61 ms · fused audio+vision");
  });

  it("subline reports a single leg honestly when only one leg has evidence", () => {
    snapshot = {
      ...emptySnapshot(),
      lessonId: "open_chords_c_major",
      lastDiagnosis: {
        t: 0,
        code: "muted_string",
        target: { lessonId: "open_chords_c_major", step: 0, chord: "C" },
        evidence: { audio: "G string silent" },
        severity: 0.5,
        conf: 0.6,
      },
    };
    render(<HintBar />);
    expect(screen.getByTestId("hint-bar-subline")).toHaveTextContent("fused audio");
    expect(screen.getByTestId("hint-bar-subline")).not.toHaveTextContent("fused audio+vision");
  });

  it("omits the subline entirely when there's no diagnosis yet (no fake data)", () => {
    snapshot = { ...emptySnapshot(), lessonId: "open_chords_c_major" };
    render(<HintBar />);
    expect(screen.queryByTestId("hint-bar-subline")).not.toBeInTheDocument();
  });

  it("tip-wrong is enabled exactly when a hint exists, and calls flagTipWrong", () => {
    snapshot = {
      ...emptySnapshot(),
      lessonId: "open_chords_c_major",
      hint: { t: 0, code: "ok", text: "Sounding good", hedged: false, conf: 0.9, severity: 0 },
    };
    render(<HintBar />);
    const btn = screen.getByTestId("hint-bar-tip-wrong");
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(flagTipWrong).toHaveBeenCalledTimes(1);
  });
});
