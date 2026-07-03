// Monophonic pitch detection for the tuner (own YIN DSP). ADR-005 names CREPE
// via onnxcrepe as the intended path; a license-clean CREPE ONNX export needs a
// manual step, so YIN (de Cheveigné & Kawahara 2002) is the shipped fallback —
// robust enough for a single-note tuner and fully on-device.
import { nearestString } from "./pitch";

export interface F0Estimate {
  f0: number;
  /** Aperiodicity-derived confidence in [0,1] (1 - YIN dip value). */
  probability: number;
}

export interface YinOptions {
  fMin?: number;
  fMax?: number;
  /** YIN absolute threshold on the cumulative-mean-normalized difference. */
  threshold?: number;
}

/**
 * YIN f0 estimate for one (mono) buffer. Needs a few periods of the lowest
 * target pitch: at 48 kHz, open low-E (82 Hz) wants ≥ ~1200 samples — feed
 * ≥ 2048. Returns null when no periodic dip clears the threshold.
 */
export function detectF0Yin(
  signal: Float32Array,
  sampleRate: number,
  opts: YinOptions = {},
): F0Estimate | null {
  const fMin = opts.fMin ?? 70;
  const fMax = opts.fMax ?? 500;
  const threshold = opts.threshold ?? 0.15;

  const tauMax = Math.min(Math.floor(sampleRate / fMin), signal.length >> 1);
  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  if (tauMax <= tauMin) return null;

  // Difference function d(tau).
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    const lim = signal.length - tau;
    for (let i = 0; i < lim; i++) {
      const diff = signal[i] - signal[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference d'(tau).
  const dPrime = new Float32Array(tauMax + 1);
  dPrime[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += d[tau];
    dPrime[tau] = running > 0 ? (d[tau] * (tau - tauMin + 1)) / running : 1;
  }

  // Absolute threshold: first local minimum below `threshold`.
  let tauEst = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (dPrime[tau] < threshold) {
      while (tau + 1 <= tauMax && dPrime[tau + 1] < dPrime[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  // Fallback: global minimum of d'.
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (dPrime[tau] < dPrime[best]) best = tau;
    if (dPrime[best] >= 1) return null;
    tauEst = best;
  }

  // Parabolic interpolation around tauEst for sub-sample precision.
  let betterTau = tauEst;
  if (tauEst > tauMin && tauEst < tauMax) {
    const s0 = dPrime[tauEst - 1];
    const s1 = dPrime[tauEst];
    const s2 = dPrime[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }

  const f0 = sampleRate / betterTau;
  if (f0 < fMin || f0 > fMax) return null;
  return { f0, probability: Math.max(0, Math.min(1, 1 - dPrime[tauEst])) };
}

export interface TuningReading {
  f0: number;
  /** 1-based standard-tuning string (1 = low E … 6 = high E). */
  string: number;
  name: string;
  cents: number;
  probability: number;
}

/** A pitch source for the tuner (YIN today; CREPE-ONNX slots in behind this). */
export interface TunerSource {
  detect(signal: Float32Array, sampleRate: number): TuningReading | null;
}

export class YinTunerSource implements TunerSource {
  constructor(private readonly opts: YinOptions = {}) {}

  detect(signal: Float32Array, sampleRate: number): TuningReading | null {
    const est = detectF0Yin(signal, sampleRate, this.opts);
    if (!est) return null;
    const ns = nearestString(est.f0);
    return { f0: est.f0, string: ns.string, name: ns.name, cents: ns.cents, probability: est.probability };
  }
}
