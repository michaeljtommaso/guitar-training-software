// FeedbackPolicy unit tests: rate limit under flood, false-positive-averse
// confidence gates, and the exact §9.3 ranking order via constructed ties.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FeedbackPolicy, type Hint } from "./feedbackPolicy";
import type { Diagnosis, DiagnosisCode } from "./diagnosis";

const target = { lessonId: "open_chords_c_major", step: 0, chord: "C" };

function diag(t: number, code: DiagnosisCode, conf: number, severity = 0.5): Diagnosis {
  return { t, code, target, evidence: { audio: "synthetic" }, severity, conf };
}

describe("FeedbackPolicy — rate limit", () => {
  it("emits at most one hint per 1.5 s window under a confident-diagnosis flood", () => {
    const policy = new FeedbackPolicy();
    policy.setPriority(["wrong_fret", "muted_string", "missing_note", "late_strum"]);
    const hints: Hint[] = [];
    for (let t = 0; t <= 10_000; t += 50) {
      const h = policy.push(diag(t, "muted_string", 0.9, 0.6));
      if (h) hints.push(h);
    }
    expect(hints.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < hints.length; i++) {
      expect(hints[i].t - hints[i - 1].t).toBeGreaterThanOrEqual(1500);
    }
  });

  it("`ok` diagnoses never become hints", () => {
    const policy = new FeedbackPolicy();
    for (let t = 0; t <= 5000; t += 100) {
      expect(policy.push(diag(t, "ok", 0.99, 0))).toBeNull();
    }
  });
});

describe("FeedbackPolicy — false-positive-averse confidence gates", () => {
  it("below the confident gate a hint is ALWAYS hedged ('Likely …'), never a confident correction", () => {
    for (const conf of [0.35, 0.4, 0.45, 0.5, 0.54]) {
      const policy = new FeedbackPolicy();
      const h = policy.push(diag(0, "muted_string", conf, 0.9))!;
      expect(h).not.toBeNull();
      expect(h.hedged).toBe(true);
      expect(h.text.startsWith("Likely:")).toBe(true);
    }
  });

  it("below the hedge gate → silence, even for a severe diagnosis", () => {
    for (const conf of [0, 0.1, 0.2, 0.34]) {
      const policy = new FeedbackPolicy();
      expect(policy.push(diag(0, "wrong_fret", conf, 1))).toBeNull();
    }
  });

  it("at/above the confident gate the hint is not hedged", () => {
    const policy = new FeedbackPolicy();
    const h = policy.push(diag(0, "wrong_fret", 0.55, 0.7))!;
    expect(h.hedged).toBe(false);
  });
});

describe("FeedbackPolicy — §9.3 ranking (confidence → importance → benefit → non-repetition → actionability)", () => {
  /** Prime one hint at t=0 (opens a real window), buffer `candidates` inside
   *  it, then trigger selection at t=1600. Returns the winning code. */
  function winner(
    candidates: Diagnosis[],
    trigger: Diagnosis,
    primeCode: DiagnosisCode = "late_strum",
    priority: string[] = ["wrong_fret", "muted_string", "missing_note", "late_strum"],
  ): DiagnosisCode {
    const policy = new FeedbackPolicy();
    policy.setPriority(priority);
    expect(policy.push(diag(0, primeCode, 0.9))).not.toBeNull(); // prime
    for (const c of candidates) expect(policy.push(c)).toBeNull(); // buffered
    const h = policy.push(trigger)!;
    expect(h).not.toBeNull();
    return h.code;
  }

  it("1. confidence outranks pedagogical priority", () => {
    expect(
      winner(
        [diag(100, "missing_note", 0.7), diag(200, "muted_string", 0.9)],
        diag(1600, "wrong_fret", 0.6), // highest priority, lowest conf
      ),
    ).toBe("muted_string");
  });

  it("2. equal confidence → feedback_priority order decides", () => {
    expect(
      winner([diag(100, "muted_string", 0.8)], diag(1600, "wrong_fret", 0.8)),
    ).toBe("wrong_fret");
  });

  it("3. equal confidence + priority → higher severity (user benefit) wins", () => {
    expect(
      winner(
        [diag(100, "wrong_fret", 0.8, 0.3)],
        diag(1600, "wrong_fret", 0.8, 0.9),
      ),
    ).toBe("wrong_fret"); // same code — verify by severity on the hint below
    const policy = new FeedbackPolicy();
    policy.setPriority(["wrong_fret"]);
    policy.push(diag(0, "late_strum", 0.9));
    policy.push(diag(100, "wrong_fret", 0.8, 0.3));
    const h = policy.push(diag(1600, "wrong_fret", 0.8, 0.9))!;
    expect(h.severity).toBe(0.9);
  });

  it("4. all else tied → a recently-given code is deprioritized (non-repetition)", () => {
    // muted_string was the primed (recently given) hint; both candidates tie
    // on conf, priority rank (absent from the list) and severity.
    expect(
      winner(
        [diag(100, "muted_string", 0.8, 0.5)],
        diag(1600, "missing_note", 0.8, 0.5),
        "muted_string",
        ["wrong_fret"],
      ),
    ).toBe("missing_note");
  });

  it("5. final tiebreak: actionability", () => {
    // Neither code recently given, tied conf/priority/severity:
    // muted_string (0.8) is more actionable than missing_note (0.6).
    expect(
      winner(
        [diag(100, "missing_note", 0.8, 0.5)],
        diag(1600, "muted_string", 0.8, 0.5),
        "late_strum",
        ["wrong_fret"],
      ),
    ).toBe("muted_string");
  });
});

describe("FeedbackPolicy — purity guard", () => {
  it("policy source contains no wall-clock, timer, or randomness tokens", () => {
    // The policy is deterministic: time comes only from diagnosis timestamps.
    // Same guard as engine.ts (engine.test.ts) — the reviewer flagged the policy
    // as equally pure but previously unguarded.
    // vitest root = apps/web (import.meta.url is not a file: URL under jsdom).
    const src = readFileSync(resolve(process.cwd(), "src/fusion/feedbackPolicy.ts"), "utf8");
    expect(src).not.toMatch(/Date\.now|Math\.random|performance\.|setTimeout|setInterval|requestAnimationFrame/);
  });
});
