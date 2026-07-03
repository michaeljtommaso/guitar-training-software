// SYNTHETIC-FIXTURE REGRESSION GATE — NOT the §16 accuracy gates.
//
// Runs the EXISTING committed synthetic fixtures through the REAL code paths
// (chord matcher, fingertip→string/fret, onset detector, analyzer latency) and
// asserts the current baselines. Its ONLY claim is "the code still behaves as it
// did on synthetic input" — it says NOTHING about real-guitar accuracy or the
// §16 latency budgets, which need real captures + a reference laptop (BLOCKERS).
//
// Wired as `pnpm eval-smoke` and a dedicated CI job. A single-constant
// regression (e.g. a corrupted chord template) MUST fail this gate.
import { beforeAll, describe, expect, it } from "vitest";
import { MagnitudeSpectrum, rms, spectralFlatness } from "../perception/audio/dsp/fft";
import { computeChroma } from "../perception/audio/dsp/chroma";
import { ChordMatcher, CHORD_LABELS } from "../perception/audio/dsp/chords";
import {
  chordSignal,
  whiteNoise,
  silence,
  harmonicNote,
  placeAt,
  resetNoiseSeed,
  OPEN_CHORD_FREQS,
} from "../perception/audio/dsp/synth";
import { analyzeOnsets } from "../perception/audio/dsp/onset";
import { analyzeSignal } from "../perception/audio/analysis";
import { IDENTITY_HOMOGRAPHY } from "../perception/vision/homography";
import { fretLineX, stringY } from "../perception/vision/fretboard";
import { mapFingertips } from "../perception/vision/fingerMapping";
import type { Landmark } from "../fusion/events/visionEvents";

const SR = 48000;
const LABEL = "synthetic-fixture regression gate — NOT the §16 accuracy gates";

beforeAll(() => {
  console.log(`\n[eval-smoke] ${LABEL}`);
});

// ── (a) chord template matcher: 8 chords + silence + noise → 10/10 exact ─────
const CHORD_FFT = 8192;
const CHORD_HOP = 2048;
function classifyChordSignal(signal: Float32Array): string {
  const spec = new MagnitudeSpectrum(CHORD_FFT);
  const matcher = new ChordMatcher();
  const frame = new Float32Array(CHORD_FFT);
  let label = "silence";
  for (let start = 0; start + CHORD_FFT <= signal.length; start += CHORD_HOP) {
    frame.set(signal.subarray(start, start + CHORD_FFT));
    const mag = spec.compute(frame);
    label = matcher.process(computeChroma(mag, SR, CHORD_FFT), rms(frame), spectralFlatness(mag)).label;
  }
  return label;
}

describe("(a) chord template matcher [synthetic]", () => {
  it("classifies all 8 open chords + silence + noise → 10/10 exact", () => {
    let correct = 0;
    for (const label of CHORD_LABELS) {
      const sig = chordSignal(OPEN_CHORD_FREQS[label], 1.0, SR, { decayTau: 0, harmonics: 6 });
      if (classifyChordSignal(sig) === label) correct++;
      else console.log(`[eval-smoke] chord ${label} misread as ${classifyChordSignal(sig)}`);
    }
    if (classifyChordSignal(silence(0.5, SR)) === "silence") correct++;
    resetNoiseSeed();
    if (classifyChordSignal(whiteNoise(0.5, SR, 0.5)) === "noise") correct++;
    console.log(`[eval-smoke] chord matcher = ${correct}/10 exact (baseline 10/10)`);
    expect(correct).toBe(10);
  });
});

// ── (b) fingertip → string/fret over geometry fixtures → exact assignments ───
function hand(tips: Record<number, [number, number]>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => [0, 0, 0] as Landmark);
  for (const [i, xy] of Object.entries(tips)) lm[+i] = [xy[0], xy[1], 0];
  return lm;
}
const cell = (s: number, fret: number): [number, number] => [
  (fretLineX(fret - 1) + fretLineX(fret)) / 2,
  stringY(s),
];

describe("(b) fingertip → string/fret [synthetic, identity homography]", () => {
  it("recovers exact (string,fret) cells for a placed hand", () => {
    // index → 2/1, middle → 4/2, ring → 5/3 (canonical open-C geometry).
    const readings = mapFingertips(hand({ 8: cell(2, 1), 12: cell(4, 2), 16: cell(5, 3) }), IDENTITY_HOMOGRAPHY, {
      homographyConf: 1,
    });
    const byFinger = Object.fromEntries(readings.map((r) => [r.finger, r]));
    expect([byFinger.index.string, byFinger.index.fret]).toEqual([2, 1]);
    expect([byFinger.middle.string, byFinger.middle.fret]).toEqual([4, 2]);
    expect([byFinger.ring.string, byFinger.ring.fret]).toEqual([5, 3]);
    console.log("[eval-smoke] fingertip→string/fret = 3/3 exact assignments");
  });
});

// ── (c) onset detector over a click fixture → timing error < tolerance ───────
describe("(c) onset detector [synthetic]", () => {
  it("locates a pluck onset within the stated synthetic tolerance", () => {
    const TOL_MS = 35; // synthetic tolerance — NOT the §16 <100 ms real-audio MAE
    const note = harmonicNote(196, 0.6, SR, { decayTau: 0.25, amp: 0.8 });
    const signal = placeAt(note, 0.5, 1.2, SR);
    const onsets = analyzeOnsets(signal, SR);
    expect(onsets.length).toBeGreaterThanOrEqual(1);
    const err = Math.min(...onsets.map((o) => Math.abs(o.t - 500)));
    console.log(`[eval-smoke] onset timing error = ${err.toFixed(1)} ms (tol ${TOL_MS} ms, synthetic)`);
    expect(err).toBeLessThan(TOL_MS);
  });
});

// ── (d) analyzer latency on a fixed buffer vs a generous headless budget ─────
describe("(d) analyzer latency [synthetic, headless]", () => {
  it("analyzes a 1 s buffer under a generous headless budget", () => {
    // GENEROUS headless budget — a CI-runner sanity ceiling, NOT the §16
    // reference-laptop latency gate (that needs the real reference hardware).
    const HEADLESS_BUDGET_MS = 2000;
    const sig = chordSignal(OPEN_CHORD_FREQS.G, 1.0, SR, { decayTau: 0.4 });
    const t0 = performance.now();
    analyzeSignal(sig, SR);
    const dt = performance.now() - t0;
    console.log(`[eval-smoke] analyzer latency = ${dt.toFixed(1)} ms on a 1 s buffer (budget ${HEADLESS_BUDGET_MS} ms)`);
    expect(dt).toBeLessThan(HEADLESS_BUDGET_MS);
  });
});
