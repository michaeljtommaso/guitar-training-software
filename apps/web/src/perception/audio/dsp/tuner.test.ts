import { describe, it, expect } from "vitest";
import { detectF0Yin, YinTunerSource } from "./tuner";
import { centsBetween } from "./pitch";
import { sineWave, harmonicNote, whiteNoise, resetNoiseSeed } from "./synth";

const SR = 48000;

describe("YIN tuner (synthetic)", () => {
  it("tracks pure sine tones within a few cents", () => {
    for (const f of [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]) {
      const est = detectF0Yin(sineWave(f, 0.2, SR), SR);
      expect(est).not.toBeNull();
      const cents = Math.abs(centsBetween(est!.f0, f));
      expect(cents).toBeLessThan(5);
    }
  });

  it("maps a detected pitch to the nearest standard-tuning string", () => {
    const tuner = new YinTunerSource();
    const openA = tuner.detect(harmonicNote(110, 0.2, SR, { decayTau: 0 }), SR)!;
    expect(openA.string).toBe(5); // A2 — standard convention: A is the 5th string
    expect(openA.name).toBe("A2");
    expect(Math.abs(openA.cents)).toBeLessThan(5);

    const lowE = tuner.detect(sineWave(82.41, 0.2, SR), SR)!;
    expect(lowE.string).toBe(6); // E2 — standard convention: low E is the 6th string
  });

  it("reports a sharp string's cents offset", () => {
    const tuner = new YinTunerSource();
    // A2 pulled ~+46 cents sharp (113 Hz vs 110 Hz).
    const r = tuner.detect(sineWave(113.0, 0.2, SR), SR)!;
    expect(r.string).toBe(5); // A2 → 5th string (standard convention)
    const expected = centsBetween(113.0, 110.0); // ~+46.6
    expect(r.cents).toBeGreaterThan(30);
    expect(Math.abs(r.cents - expected)).toBeLessThan(8);
    console.log(`[tuner][synthetic] 113 Hz → ${r.name} ${r.cents.toFixed(1)} cents (expected ~${expected.toFixed(1)})`);
  });

  it("returns null on silence", () => {
    expect(detectF0Yin(new Float32Array(4096), SR)).toBeNull();
  });

  // BUG-001 req 2: the tuner must not lock onto the mic noise floor / low hum.
  // YinTunerSource gates on frame RMS below the shared silence floor.
  it("returns no reading for a periodic-but-sub-floor-quiet signal", () => {
    const tuner = new YinTunerSource();
    // A clean 85 Hz sine (YIN would happily lock on) but at amp 0.001 →
    // rms ≈ 7e-4, far below the 0.005 silence floor. Phantom 'E2 · 85 Hz'.
    expect(tuner.detect(sineWave(85, 0.2, SR, 0.001), SR)).toBeNull();
  });

  it("returns no reading for near-silent noise below the silence floor", () => {
    resetNoiseSeed();
    const tuner = new YinTunerSource();
    expect(tuner.detect(whiteNoise(0.2, SR, 0.01), SR)).toBeNull();
  });
});
