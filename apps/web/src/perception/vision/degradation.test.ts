import { describe, expect, it } from "vitest";
import {
  CALIB_HALF_LIFE_MS,
  OVERLAY_DIM_THRESHOLD,
  decayConfidence,
  effectiveCalibConf,
  overlayOpacity,
} from "./degradation";

describe("decayConfidence (held-homography decay, WP-3 §7)", () => {
  it("is unchanged at t=0", () => {
    expect(decayConfidence(0.9, 0)).toBeCloseTo(0.9, 12);
  });

  it("halves after one half-life", () => {
    expect(decayConfidence(0.8, CALIB_HALF_LIFE_MS)).toBeCloseTo(0.4, 9);
    expect(decayConfidence(0.8, 2 * CALIB_HALF_LIFE_MS)).toBeCloseTo(0.2, 9);
  });

  it("is monotonically decreasing and bounded to [0,1]", () => {
    let prev = 1;
    for (let ms = 0; ms <= 10_000; ms += 500) {
      const c = decayConfidence(1, ms);
      expect(c).toBeLessThanOrEqual(prev);
      expect(c).toBeGreaterThanOrEqual(0);
      prev = c;
    }
  });
});

describe("effectiveCalibConf", () => {
  it("is 0 when uncalibrated", () => {
    expect(effectiveCalibConf(false, 1, 0, false)).toBe(0);
  });

  it("holds a static (non-live) calibration at full confidence — no decay", () => {
    expect(effectiveCalibConf(true, 1, 0, false)).toBe(1);
    expect(effectiveCalibConf(true, 1, 60_000, false)).toBe(1);
    expect(effectiveCalibConf(true, 0.5, 10 * CALIB_HALF_LIFE_MS, false)).toBeCloseTo(0.5, 9);
  });

  it("decays a live-tracked calibration with time", () => {
    expect(effectiveCalibConf(true, 0.8, CALIB_HALF_LIFE_MS, true)).toBeCloseTo(0.4, 9);
  });
});

describe("overlayOpacity", () => {
  it("is full above the dim threshold", () => {
    expect(overlayOpacity(OVERLAY_DIM_THRESHOLD)).toBe(1);
    expect(overlayOpacity(0.9)).toBe(1);
  });

  it("dims below the threshold but never fully disappears", () => {
    const dim = overlayOpacity(OVERLAY_DIM_THRESHOLD / 2);
    expect(dim).toBeLessThan(1);
    expect(dim).toBeGreaterThan(0);
    expect(overlayOpacity(0)).toBeGreaterThan(0);
  });
});
