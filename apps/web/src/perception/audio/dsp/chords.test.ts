import { describe, it, expect } from "vitest";
import { MagnitudeSpectrum, rms, spectralFlatness } from "./fft";
import { computeChroma } from "./chroma";
import { classifyChroma, ChordMatcher, CHORD_LABELS } from "./chords";
import { chordSignal, whiteNoise, silence, resetNoiseSeed, OPEN_CHORD_FREQS } from "./synth";

const SR = 48000;
// Chroma needs frequency resolution (low guitar notes); mirror the analyzer's
// long window (8192 @ 48k ≈ 5.9 Hz bins).
const FFT = 8192;
const HOP = 2048;

// Average chroma over a signal's frames, then classify with the mean level.
function classifySignal(signal: Float32Array) {
  const spec = new MagnitudeSpectrum(FFT);
  const matcher = new ChordMatcher();
  const frame = new Float32Array(FFT);
  let last = classifyChroma(new Float32Array(12), 0, 1);
  for (let start = 0; start + FFT <= signal.length; start += HOP) {
    frame.set(signal.subarray(start, start + FFT));
    const mag = spec.compute(frame);
    const chroma = computeChroma(mag, SR, FFT);
    last = matcher.process(chroma, rms(frame), spectralFlatness(mag));
  }
  return last;
}

describe("chord template match (synthetic)", () => {
  it("classifies all 8 open chords correctly", () => {
    let correct = 0;
    for (const label of CHORD_LABELS) {
      const sig = chordSignal(OPEN_CHORD_FREQS[label], 1.0, SR, { decayTau: 0, harmonics: 6 });
      const res = classifySignal(sig);
      if (res.label === label) correct++;
      else {
        console.log(`[chord][synthetic] ${label} misread as ${res.label} (p=${res.conf.toFixed(2)})`);
      }
      expect(res.label).toBe(label);
    }
    console.log(`[chord][synthetic] open-chord classification = ${correct}/8 correct`);
    expect(correct).toBe(8);
  });

  it("classifies silence as silence", () => {
    expect(classifySignal(silence(0.5, SR)).label).toBe("silence");
  });

  it("classifies white noise as noise", () => {
    resetNoiseSeed();
    expect(classifySignal(whiteNoise(0.5, SR, 0.5)).label).toBe("noise");
  });

  it("posterior sums to 1 and is sorted", () => {
    const sig = chordSignal(OPEN_CHORD_FREQS.E, 0.5, SR);
    const res = classifySignal(sig);
    const sum = res.posterior.reduce((a, p) => a + p.p, 0);
    expect(sum).toBeCloseTo(1, 4);
    for (let i = 1; i < res.posterior.length; i++) {
      expect(res.posterior[i - 1].p).toBeGreaterThanOrEqual(res.posterior[i].p);
    }
  });
});
