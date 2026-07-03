import { describe, expect, it } from "vitest";
import { computeSpectrogram } from "./spectrogram";

function sineWave(freq: number, seconds: number, sr: number): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

describe("computeSpectrogram", () => {
  it("produces one frame per hop across the signal", () => {
    const sr = 48000;
    const samples = sineWave(440, 0.5, sr); // 24000 samples
    const { frames } = computeSpectrogram(samples, sr, 1024, 256);
    const expectedFrames = Math.floor((samples.length - 1024) / 256) + 1;
    expect(frames).toHaveLength(expectedFrames);
    expect(frames[0]).toHaveLength(1024 / 2 + 1);
  });

  it("each frame's energy peaks near the tone's bin, consistently", () => {
    const sr = 48000;
    const windowSize = 1024;
    const freq = (sr / windowSize) * 40; // exactly bin 40
    const samples = sineWave(freq, 0.2, sr);
    const { frames } = computeSpectrogram(samples, sr, windowSize, 512);
    expect(frames.length).toBeGreaterThan(0);
    for (const mag of frames) {
      let peak = 1;
      for (let k = 2; k < mag.length; k++) if (mag[k] > mag[peak]) peak = k;
      expect(Math.abs(peak - 40)).toBeLessThanOrEqual(1);
    }
  });

  it("returns hopSeconds derived from hopSize/sampleRate", () => {
    const { hopSeconds } = computeSpectrogram(new Float32Array(2048), 48000, 1024, 256);
    expect(hopSeconds).toBeCloseTo(256 / 48000, 12);
  });
});
