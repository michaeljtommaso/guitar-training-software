import { describe, expect, it } from "vitest";
import { JamsFileSchema } from "./jams";

const sample = {
  file_metadata: { clipId: "clip-001", duration: 12.5 },
  annotations: [
    {
      namespace: "chord",
      data: [
        { time: 0, duration: 1.2, value: "C", confidence: 0.91 },
        { time: 1.2, duration: 0.8, value: "G", confidence: null },
      ],
    },
    {
      namespace: "onset",
      data: [{ time: 0.02, duration: 0, value: true, confidence: 0.99 }],
    },
  ],
};

describe("JamsFileSchema", () => {
  it("round-trips a sample through parse -> stringify -> parse", () => {
    const parsed = JamsFileSchema.parse(sample);
    const roundTripped = JamsFileSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(sample);
  });

  it("rejects a sample missing required fields", () => {
    const bad = { file_metadata: { clipId: "clip-001" }, annotations: [] };
    expect(JamsFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an out-of-range confidence", () => {
    const bad = {
      ...sample,
      annotations: [{ namespace: "chord", data: [{ time: 0, duration: 1, value: "C", confidence: 1.5 }] }],
    };
    expect(JamsFileSchema.safeParse(bad).success).toBe(false);
  });
});
