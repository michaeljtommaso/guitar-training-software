// §9.1 schema boundary tests: the exact Diagnosis shape, and accept/reject
// behavior of the event schemas used at the worker→fusion ingest boundary.
import { describe, expect, it } from "vitest";
import {
  AudioEventSchema,
  VisionEventSchema,
  DiagnosisSchema,
  DIAGNOSIS_CODES,
} from "./diagnosis";

describe("AudioEventSchema", () => {
  it("accepts all four §9.1 audio event kinds", () => {
    expect(AudioEventSchema.safeParse({ t: 1, kind: "onset", strength: 0.5, conf: 0.9 }).success).toBe(true);
    expect(AudioEventSchema.safeParse({ t: 1, kind: "chord", label: "Am", conf: 0.7 }).success).toBe(true);
    expect(AudioEventSchema.safeParse({ t: 1, kind: "notes", pitches: [48, 52], conf: 0.8 }).success).toBe(true);
    expect(AudioEventSchema.safeParse({ t: 1, kind: "tuning", string: 6, cents: -12.5 }).success).toBe(true);
  });

  it("rejects malformed events (bad kind, out-of-range conf, missing fields)", () => {
    expect(AudioEventSchema.safeParse({ t: 1, kind: "beat", conf: 0.5 }).success).toBe(false);
    expect(AudioEventSchema.safeParse({ t: 1, kind: "chord", label: "C", conf: 1.5 }).success).toBe(false);
    expect(AudioEventSchema.safeParse({ t: 1, kind: "tuning", string: 7, cents: 0 }).success).toBe(false);
    expect(AudioEventSchema.safeParse({ kind: "onset", strength: 1, conf: 0.5 }).success).toBe(false);
    expect(AudioEventSchema.safeParse(null).success).toBe(false);
  });
});

describe("VisionEventSchema", () => {
  it("accepts all four §9.1 vision event kinds (fingerAssign ± behindFretDist)", () => {
    expect(
      VisionEventSchema.safeParse({ t: 1, kind: "hand", landmarks: [[0.1, 0.2, 0]], handed: "L", conf: 0.9 })
        .success,
    ).toBe(true);
    expect(
      VisionEventSchema.safeParse({
        t: 1,
        kind: "fingerAssign",
        assigns: [{ finger: "index", string: 2, fret: 1, conf: 0.8 }],
      }).success,
    ).toBe(true);
    expect(
      VisionEventSchema.safeParse({
        t: 1,
        kind: "fingerAssign",
        assigns: [{ finger: "ring", string: 5, fret: 3, conf: 0.8, behindFretDist: 0.2 }],
      }).success,
    ).toBe(true);
    expect(VisionEventSchema.safeParse({ t: 1, kind: "calib", homographyConf: 0.75 }).success).toBe(true);
    expect(VisionEventSchema.safeParse({ t: 1, kind: "strum", dir: "down", conf: 0.6 }).success).toBe(true);
  });

  it("rejects malformed events", () => {
    expect(VisionEventSchema.safeParse({ t: 1, kind: "strum", dir: "sideways", conf: 0.6 }).success).toBe(false);
    expect(
      VisionEventSchema.safeParse({ t: 1, kind: "fingerAssign", assigns: [{ finger: "fist", string: 2, fret: 1, conf: 0.5 }] })
        .success,
    ).toBe(false);
    expect(VisionEventSchema.safeParse({ t: 1, kind: "calib" }).success).toBe(false);
  });
});

describe("DiagnosisSchema (§9.1 exact)", () => {
  const valid = {
    t: 1234,
    code: "missing_note",
    target: { lessonId: "open_chords_c_major", step: 0, chord: "C" },
    evidence: { audio: "high e (string 1) not heard", vision: "shape matches C (90%)" },
    severity: 0.5,
    conf: 0.6,
  };

  it("accepts a valid diagnosis and every code in the §9.1 union", () => {
    expect(DiagnosisSchema.safeParse(valid).success).toBe(true);
    for (const code of DIAGNOSIS_CODES) {
      expect(DiagnosisSchema.safeParse({ ...valid, code, evidence: {} }).success).toBe(true);
    }
    expect(DIAGNOSIS_CODES).toEqual([
      "wrong_fret",
      "wrong_string",
      "muted_string",
      "behind_fret",
      "missing_note",
      "late_strum",
      "ok",
    ]);
  });

  it("rejects out-of-union codes and out-of-range severity/conf", () => {
    expect(DiagnosisSchema.safeParse({ ...valid, code: "wrong_chord" }).success).toBe(false);
    expect(DiagnosisSchema.safeParse({ ...valid, severity: 1.2 }).success).toBe(false);
    expect(DiagnosisSchema.safeParse({ ...valid, conf: -0.1 }).success).toBe(false);
    expect(DiagnosisSchema.safeParse({ ...valid, target: { lessonId: "", step: 0, chord: "C" } }).success).toBe(false);
  });
});
