import { describe, expect, it } from "vitest";
import { LatencyHistogram, LATENCY_BUCKETS_MS } from "./latencyHistogram";

describe("LatencyHistogram", () => {
  it("is empty until fed", () => {
    const h = new LatencyHistogram();
    expect(h.count).toBe(0);
    expect(h.p50).toBeNaN();
    expect(h.p95).toBeNaN();
  });

  it("known samples → known p50/p95 (exact nearest-rank)", () => {
    const h = new LatencyHistogram();
    // 1..10 ms. nearest-rank: p50 → ceil(0.5*10)=5th smallest = 5;
    // p95 → ceil(0.95*10)=10th smallest = 10.
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) h.record(v);
    expect(h.count).toBe(10);
    expect(h.p50).toBe(5);
    expect(h.p95).toBe(10);
  });

  it("known samples → known bucket counts (+ overflow)", () => {
    const h = new LatencyHistogram();
    // 0.5→bucket ≤1; 1.5→≤2; 7→≤10; 40→≤50; 900→overflow(Infinity).
    for (const v of [0.5, 1.5, 7, 40, 900]) h.record(v);
    const b = h.buckets();
    expect(b).toHaveLength(LATENCY_BUCKETS_MS.length + 1); // + overflow
    const at = (le: number) => b.find((x) => x.le === le)!.count;
    expect(at(1)).toBe(1);
    expect(at(2)).toBe(1);
    expect(at(10)).toBe(1);
    expect(at(50)).toBe(1);
    expect(at(Infinity)).toBe(1);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(5);
  });

  it("ignores non-finite samples", () => {
    const h = new LatencyHistogram();
    h.record(NaN);
    h.record(Infinity);
    h.record(3);
    expect(h.count).toBe(1);
    expect(h.p50).toBe(3);
  });

  it("ring-caps to the newest samples", () => {
    const h = new LatencyHistogram(3);
    for (const v of [1, 2, 3, 4, 5]) h.record(v); // keeps 3,4,5
    expect(h.count).toBe(3);
    expect(h.p50).toBe(4);
  });
});
