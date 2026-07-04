import { describe, expect, it } from "vitest";
import { flashFor } from "./flash";
import { DEFAULT_POLICY_CONFIG } from "../fusion/feedbackPolicy";
import type { Diagnosis, DiagnosisCode } from "../fusion/diagnosis";

const GATE = DEFAULT_POLICY_CONFIG.confidentGate;
const WINDOW = DEFAULT_POLICY_CONFIG.windowMs;

function diag(code: DiagnosisCode, conf: number, t: number): Diagnosis {
  return {
    t,
    code,
    target: { lessonId: "l", step: 0, chord: "C" },
    evidence: {},
    severity: 0.5,
    conf,
  };
}

describe("flashFor confidence gating (ADR-007 false-positive-averse)", () => {
  it("below the confident gate → NO flash (silence over false alarms)", () => {
    expect(flashFor(diag("wrong_fret", GATE - 0.01, 1000), -Infinity)).toBeNull();
    expect(flashFor(diag("ok", GATE - 0.01, 1000), -Infinity)).toBeNull();
  });

  it("above the gate + critical code → RED", () => {
    for (const code of ["wrong_fret", "wrong_string", "muted_string", "behind_fret", "missing_note", "late_strum"] as const) {
      const f = flashFor(diag(code, 0.8, 1000), -Infinity);
      expect(f?.color).toBe("error");
    }
  });

  it("above the gate + ok → GREEN", () => {
    expect(flashFor(diag("ok", 0.8, 1000), -Infinity)?.color).toBe("correct");
  });

  it("exactly at the gate passes (>= gate)", () => {
    expect(flashFor(diag("wrong_fret", GATE, 1000), -Infinity)?.color).toBe("error");
  });
});

describe("flashFor rate limit under a diagnosis flood", () => {
  it("never fires two flashes closer than the feedback-policy window", () => {
    // Simulate the fusionStore loop: keep lastT of the last flash.
    let lastT = -Infinity;
    const fired: number[] = [];
    // A flood: a confident wrong diagnosis every 100 ms for ~6 s.
    for (let t = 0; t <= 6000; t += 100) {
      const f = flashFor(diag("wrong_fret", 0.9, t), lastT);
      if (f) {
        fired.push(f.t);
        lastT = f.t;
      }
    }
    // Consecutive flashes are >= WINDOW apart (no strobing).
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i] - fired[i - 1]).toBeGreaterThanOrEqual(WINDOW);
    }
    // 60 diagnoses collapse to at most ceil(6000/WINDOW)+1 flashes.
    expect(fired.length).toBeLessThanOrEqual(Math.ceil(6000 / WINDOW) + 1);
    expect(fired.length).toBeGreaterThan(0);
  });
});
