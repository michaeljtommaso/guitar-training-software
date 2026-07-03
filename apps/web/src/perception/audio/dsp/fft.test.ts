import { describe, it, expect } from "vitest";
import { fftInPlace, magnitudeSpectrum, spectralFlatness, rms } from "./fft";
import { sineWave, whiteNoise, resetNoiseSeed } from "./synth";

describe("fft", () => {
  it("rejects non-power-of-two lengths", () => {
    expect(() => fftInPlace(new Float32Array(3), new Float32Array(3))).toThrow();
  });

  it("puts a pure cosine's energy in exactly its bin", () => {
    const N = 64;
    const bin = 5;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / N);
    fftInPlace(re, im);
    const mag = re.map((r, k) => Math.hypot(r, im[k]));
    let peak = 0;
    for (let k = 1; k < N / 2; k++) if (mag[k] > mag[peak]) peak = k;
    expect(peak).toBe(bin);
  });

  it("magnitudeSpectrum peaks near a windowed sine's frequency", () => {
    const sr = 48000;
    const N = 1024;
    const freq = (sr / N) * 40; // exactly bin 40
    const mag = magnitudeSpectrum(sineWave(freq, N / sr, sr).subarray(0, N));
    let peak = 1;
    for (let k = 2; k < mag.length; k++) if (mag[k] > mag[peak]) peak = k;
    expect(Math.abs(peak - 40)).toBeLessThanOrEqual(1);
  });

  it("spectralFlatness: tone is low, white noise is high", () => {
    const sr = 48000;
    const N = 1024;
    const toneMag = magnitudeSpectrum(sineWave(440, N / sr, sr).subarray(0, N));
    resetNoiseSeed();
    const noiseMag = magnitudeSpectrum(whiteNoise(N / sr, sr, 1).subarray(0, N));
    const toneFlat = spectralFlatness(toneMag);
    const noiseFlat = spectralFlatness(noiseMag);
    expect(toneFlat).toBeLessThan(0.1);
    expect(noiseFlat).toBeGreaterThan(0.4);
    expect(rms(sineWave(440, 0.01, sr))).toBeGreaterThan(0);
  });
});
