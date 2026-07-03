// Open-chord recognition: chroma → template cosine-similarity match over the
// 8 MVP open chords, with a `silence`/`noise` gate (ADR-005). Interpretable and
// license-clean; the Phase-1 CRNN replaces this only if it plateaus < the 90%
// gate.
//
// Templates are binary pitch-class sets (the chord tones), L2-normalized. Since
// chroma is also L2-normalized, cosine similarity is a dot product. A softmax
// over the similarities gives an interpretable posterior.
import { PITCH_CLASS_NAMES } from "./pitch";

export const CHORD_LABELS = ["C", "G", "D", "A", "E", "Am", "Em", "Dm"] as const;
export type ChordLabel = (typeof CHORD_LABELS)[number];
export type ChordClass = ChordLabel | "noise" | "silence";

// Pitch-class members of each open chord (C=0 … B=11).
const CHORD_PITCH_CLASSES: Record<ChordLabel, number[]> = {
  C: [0, 4, 7], // C E G
  G: [7, 11, 2], // G B D
  D: [2, 6, 9], // D F# A
  A: [9, 1, 4], // A C# E
  E: [4, 8, 11], // E G# B
  Am: [9, 0, 4], // A C E
  Em: [4, 7, 11], // E G B
  Dm: [2, 5, 9], // D F A
};

function normalizedTemplate(members: number[]): Float32Array {
  const v = new Float32Array(12);
  for (const pc of members) v[pc] = 1;
  const norm = Math.sqrt(members.length);
  for (let i = 0; i < 12; i++) v[i] /= norm;
  return v;
}

const TEMPLATES: [ChordLabel, Float32Array][] = CHORD_LABELS.map((l) => [
  l,
  normalizedTemplate(CHORD_PITCH_CLASSES[l]),
]);

export interface ChordPosterior {
  label: ChordLabel;
  p: number;
}

export interface ChordResult {
  label: ChordClass;
  conf: number;
  /** Softmax posterior over the 8 open chords (sums to 1), sorted desc. */
  posterior: ChordPosterior[];
}

export interface ChordConfig {
  /** RMS below this → `silence`. */
  silenceRms?: number;
  /** Spectral flatness above this (and not silent) → `noise`. */
  noiseFlatness?: number;
  /** Softmax temperature over cosine similarities (lower = peakier posterior). */
  temperature?: number;
}

const dot = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += a[i] * b[i];
  return s;
};

/**
 * Classify a single chroma frame. `rms` (time-domain level) drives the silence
 * gate; `flatness` (spectral flatness, [0,1]) drives the noise gate. Pure — the
 * stateful smoothing lives in `ChordMatcher`.
 */
export function classifyChroma(
  chroma: Float32Array,
  rms: number,
  flatness: number,
  cfg: ChordConfig = {},
): ChordResult {
  const silenceRms = cfg.silenceRms ?? 0.005;
  const noiseFlatness = cfg.noiseFlatness ?? 0.4;
  const temperature = cfg.temperature ?? 0.1;

  // Similarities are needed for the posterior regardless of the gate outcome.
  const sims = TEMPLATES.map(([label, tpl]) => ({ label, sim: dot(chroma, tpl) }));
  const maxSim = Math.max(...sims.map((s) => s.sim));
  let expSum = 0;
  const exps = sims.map((s) => {
    const e = Math.exp((s.sim - maxSim) / temperature);
    expSum += e;
    return e;
  });
  const posterior: ChordPosterior[] = sims
    .map((s, i) => ({ label: s.label, p: exps[i] / expSum }))
    .sort((a, b) => b.p - a.p);

  if (rms < silenceRms) return { label: "silence", conf: 1, posterior };
  if (flatness > noiseFlatness) return { label: "noise", conf: 1 - maxSim, posterior };

  return { label: posterior[0].label, conf: posterior[0].p, posterior };
}

/**
 * Stateful chord matcher with temporal smoothing: an EMA over the chroma vector
 * suppresses per-frame jitter before classification. Feed one frame per hop.
 */
export class ChordMatcher {
  private ema: Float32Array | null = null;
  private readonly alpha: number;
  private readonly cfg: ChordConfig;

  constructor(cfg: ChordConfig & { smoothing?: number } = {}) {
    this.alpha = cfg.smoothing ?? 0.4; // weight of the newest frame
    this.cfg = cfg;
  }

  process(chroma: Float32Array, rms: number, flatness: number): ChordResult {
    if (!this.ema) this.ema = new Float32Array(chroma);
    else for (let i = 0; i < 12; i++) this.ema[i] += this.alpha * (chroma[i] - this.ema[i]);
    // Re-normalize the smoothed vector so cosine stays a dot.
    const sm = new Float32Array(this.ema);
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += sm[i] * sm[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < 12; i++) sm[i] /= norm;
    return classifyChroma(sm, rms, flatness, this.cfg);
  }
}

export function pitchClassName(pc: number): string {
  return PITCH_CLASS_NAMES[((pc % 12) + 12) % 12];
}
