// FFT magnitude spectrum → 12-bin pitch-class chroma. Each bin in the guitar
// band is folded onto its nearest pitch class and summed; the vector is L2-
// normalized so cosine similarity against chord templates is a plain dot.
import { freqToPitchClass } from "./pitch";

export interface ChromaOptions {
  /** Lowest frequency folded into chroma (Hz). Below open low-E's fundamental
   *  omits DC/rumble; default 70 keeps E2 (82 Hz). */
  fMin?: number;
  /** Highest frequency folded into chroma (Hz). */
  fMax?: number;
}

/** L2-normalized 12-bin chroma from a magnitude spectrum. */
export function computeChroma(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number,
  opts: ChromaOptions = {},
): Float32Array {
  const fMin = opts.fMin ?? 70;
  const fMax = opts.fMax ?? 2000;
  const binHz = sampleRate / fftSize;
  const chroma = new Float32Array(12);
  for (let k = 1; k < mag.length; k++) {
    const f = k * binHz;
    if (f < fMin || f > fMax) continue;
    chroma[freqToPitchClass(f)] += mag[k];
  }
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 12; i++) chroma[i] /= norm;
  return chroma;
}
