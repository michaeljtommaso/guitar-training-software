// Synthetic guitar-ish signal generators for tests and the offline plumbing
// proof. Harmonic-rich plucked tones at real string frequencies — enough to
// exercise chroma/onset/tuner DSP without real capture. NOT shipped in the app
// runtime (imported only by tests / the proof script).
export interface NoteOptions {
  harmonics?: number;
  /** Per-harmonic amplitude falloff exponent (amp_h = amp / h^rolloff). */
  rolloff?: number;
  /** Exponential amplitude decay time constant (s); 0 = sustained. */
  decayTau?: number;
  amp?: number;
}

/** One plucked note: sum of harmonics with 1/h^rolloff amplitude + decay. */
export function harmonicNote(
  f0: number,
  durSec: number,
  sampleRate: number,
  opts: NoteOptions = {},
): Float32Array {
  const harmonics = opts.harmonics ?? 6;
  const rolloff = opts.rolloff ?? 1.4;
  const decayTau = opts.decayTau ?? 0.6;
  const amp = opts.amp ?? 1;
  const n = Math.floor(durSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = decayTau > 0 ? Math.exp(-t / decayTau) : 1;
    let s = 0;
    for (let h = 1; h <= harmonics; h++) {
      if (f0 * h >= sampleRate / 2) break;
      s += (1 / h ** rolloff) * Math.sin(2 * Math.PI * f0 * h * t);
    }
    out[i] = amp * env * s;
  }
  return out;
}

/** Sum several notes (strum) into one buffer. */
export function chordSignal(
  freqs: number[],
  durSec: number,
  sampleRate: number,
  opts: NoteOptions = {},
): Float32Array {
  const n = Math.floor(durSec * sampleRate);
  const out = new Float32Array(n);
  for (const f of freqs) {
    const note = harmonicNote(f, durSec, sampleRate, opts);
    for (let i = 0; i < n; i++) out[i] += note[i] / freqs.length;
  }
  return out;
}

export function sineWave(
  freq: number,
  durSec: number,
  sampleRate: number,
  amp = 1,
): Float32Array {
  const n = Math.floor(durSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

let seed = 0x9e3779b9;
function rng(): number {
  // Deterministic xorshift so noise fixtures are reproducible.
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff - 0.5;
}
export function resetNoiseSeed(s = 0x9e3779b9): void {
  seed = s >>> 0;
}

export function whiteNoise(durSec: number, sampleRate: number, amp = 1): Float32Array {
  const n = Math.floor(durSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * rng();
  return out;
}

export function silence(durSec: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.floor(durSec * sampleRate));
}

/** Place `segment` into a `totalSec` buffer starting at `atSec` (summed). */
export function placeAt(
  segment: Float32Array,
  atSec: number,
  totalSec: number,
  sampleRate: number,
): Float32Array {
  const out = new Float32Array(Math.floor(totalSec * sampleRate));
  const start = Math.floor(atSec * sampleRate);
  for (let i = 0; i < segment.length && start + i < out.length; i++) out[start + i] += segment[i];
  return out;
}

/** Sum two equal-length (or overlapping) buffers into the longer one. */
export function mix(a: Float32Array, b: Float32Array): Float32Array {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}

// Open-chord voicings — per-string fundamental frequencies (Hz), standard
// tuning. Overtones come from harmonicNote; these are the plucked fundamentals.
export const OPEN_CHORD_FREQS: Record<string, number[]> = {
  C: [130.81, 164.81, 196.0, 261.63, 329.63], // C3 E3 G3 C4 E4
  G: [98.0, 123.47, 146.83, 196.0, 246.94, 392.0], // G2 B2 D3 G3 B3 G4
  D: [146.83, 220.0, 293.66, 369.99], // D3 A3 D4 F#4
  A: [110.0, 164.81, 220.0, 277.18, 329.63], // A2 E3 A3 C#4 E4
  E: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63], // E2 B2 E3 G#3 B3 E4
  Am: [110.0, 164.81, 220.0, 261.63, 329.63], // A2 E3 A3 C4 E4
  Em: [82.41, 123.47, 164.81, 196.0, 246.94, 329.63], // E2 B2 E3 G3 B3 E4
  Dm: [146.83, 220.0, 293.66, 349.23], // D3 A3 D4 F4
};
