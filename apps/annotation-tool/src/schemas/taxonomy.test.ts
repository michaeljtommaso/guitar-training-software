import { describe, expect, it } from "vitest";
import { TaxonomyFileSchema } from "./taxonomy";

const sample = {
  clipId: "clip-001",
  annotator: "mikey",
  createdAt: "2026-07-03T00:00:00.000Z",
  consent: { given: true, scope: "internal-training-only", date: "2026-07-03" },
  quad: [
    [100, 50],
    [900, 60],
    [920, 500],
    [90, 490],
  ] as [[number, number], [number, number], [number, number], [number, number]],
  fingerAssignments: [{ frame: 12, t: 0.4, finger: "index" as const, string: 2, fret: 1 }],
  tags: [{ start: 0.3, end: 0.6, code: "wrong_fret" as const, note: "landed on fret 2 not 1" }],
};

describe("TaxonomyFileSchema", () => {
  it("round-trips a sample through parse -> stringify -> parse", () => {
    const parsed = TaxonomyFileSchema.parse(sample);
    const roundTripped = TaxonomyFileSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(sample);
  });

  it("accepts a null quad (not yet calibrated)", () => {
    expect(TaxonomyFileSchema.safeParse({ ...sample, quad: null }).success).toBe(true);
  });

  it("rejects a mistake code outside the diagnosis taxonomy", () => {
    const bad = { ...sample, tags: [{ start: 0, end: 1, code: "not_a_real_code" }] };
    expect(TaxonomyFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a string number outside 1..6", () => {
    const bad = { ...sample, fingerAssignments: [{ frame: 0, t: 0, finger: "index", string: 7, fret: 0 }] };
    expect(TaxonomyFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing consent block", () => {
    const bad: Record<string, unknown> = { ...sample };
    delete bad.consent;
    expect(TaxonomyFileSchema.safeParse(bad).success).toBe(false);
  });
});
