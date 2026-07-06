import { describe, expect, it } from "vitest";
import { makeDriveCurve } from "./shaper";
import { magnitudeSpectrum } from "../perception/audio/dsp/fft"; // existing WP-2 scaffolding
import { sineWave } from "../perception/audio/dsp/synth";

const applyCurve = (curve: Float32Array, x: number) => {
  const i = Math.round(((x + 1) / 2) * (curve.length - 1));
  return curve[Math.max(0, Math.min(curve.length - 1, i))];
};

describe("makeDriveCurve", () => {
  it("is odd-symmetric, zero-centered, and bounded", () => {
    const c = makeDriveCurve(0.7);
    const n = c.length;
    expect(n % 2).toBe(1);
    expect(c[(n - 1) / 2]).toBe(0);
    expect(Math.abs(c[0] + c[n - 1])).toBeLessThan(1e-6);
    for (let i = 0; i < n; i++) expect(Math.abs(c[i])).toBeLessThanOrEqual(1);
    for (let i = 1; i < n; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]); // monotonic
  });

  it("adds odd harmonics to a sine as drive increases", () => {
    const N = 8192;
    const sr = 48000;
    const f0 = 750; // bin-ish aligned: 750*8192/48000 = 128
    const bin = Math.round((f0 * N) / sr);
    const energyAt3rd = (amount: number) => {
      const curve = makeDriveCurve(amount);
      const buf = sineWave(f0, N / sr, sr, 0.8);
      for (let i = 0; i < N; i++) buf[i] = applyCurve(curve, buf[i]);
      const mag = magnitudeSpectrum(buf); // Hann-windowed |FFT|, N/2+1 bins
      return mag[3 * bin] / (mag[bin] + 1e-12);
    };
    expect(energyAt3rd(0.8)).toBeGreaterThan(10 * energyAt3rd(0));
    expect(energyAt3rd(0.8)).toBeGreaterThan(0.05); // audible 3rd harmonic
  });
});
