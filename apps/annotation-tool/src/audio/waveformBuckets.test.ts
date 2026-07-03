import { describe, expect, it } from "vitest";
import { computeMinMaxBuckets } from "./waveformBuckets";

describe("computeMinMaxBuckets", () => {
  it("produces the requested number of buckets", () => {
    const samples = new Float32Array(1000).map((_, i) => Math.sin(i));
    expect(computeMinMaxBuckets(samples, 50)).toHaveLength(50);
  });

  it("captures min/max per bucket exactly for a known ramp", () => {
    // 4 samples per bucket, 2 buckets: [0,1,2,3] and [4,5,6,7].
    const samples = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const buckets = computeMinMaxBuckets(samples, 2);
    expect(buckets).toEqual([
      { min: 0, max: 3 },
      { min: 4, max: 7 },
    ]);
  });

  it("returns empty for zero buckets", () => {
    expect(computeMinMaxBuckets(Float32Array.from([1, 2, 3]), 0)).toEqual([]);
  });

  it("handles more buckets than samples without NaNs", () => {
    const buckets = computeMinMaxBuckets(Float32Array.from([1, -1]), 10);
    expect(buckets).toHaveLength(10);
    for (const b of buckets) {
      expect(Number.isNaN(b.min)).toBe(false);
      expect(Number.isNaN(b.max)).toBe(false);
    }
  });
});
