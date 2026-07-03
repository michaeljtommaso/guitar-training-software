// COPY of apps/web/src/perception/audio/dsp/fft.ts (WP-6). The annotation
// tool's spectrogram strip needs the same STFT the audio perception leg
// uses; copying avoids a cross-app dependency and a new npm package for a
// ~120-line, license-clean, own-DSP module. KEEP IN SYNC by hand if the
// source ever changes (unlikely — it's a stable radix-2 FFT).
//
// Minimal radix-2 iterative FFT (own DSP, license-clean) + spectral helpers.
// Analysis windows are power-of-two (1024), so no zero-padding logic is needed.
// ponytail: naive O(N log N) complex FFT on real input (imag=0); a split-radix
// real-FFT would halve the work — swap in only if the audio loop shows up hot.

/** In-place iterative Cooley–Tukey FFT. `re`/`im` length must be a power of 2. */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wReal = Math.cos(ang);
    const wImag = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tr = re[b] * curReal - im[b] * curImag;
        const ti = re[b] * curImag + im[b] * curReal;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

/** Periodic Hann window of length n (cached per size). */
const hannCache = new Map<number, Float32Array>();
export function hann(n: number): Float32Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
    hannCache.set(n, w);
  }
  return w;
}

/**
 * Magnitude spectrum of a real frame. Applies a Hann window, runs the FFT, and
 * returns the first n/2+1 magnitude bins. Allocates fresh scratch each call —
 * for the hot path, reuse a `MagnitudeSpectrum` (below).
 */
export function magnitudeSpectrum(frame: Float32Array): Float32Array {
  return new MagnitudeSpectrum(frame.length).compute(frame);
}

/** Reusable, allocation-free magnitude-spectrum computer for one FFT size. */
export class MagnitudeSpectrum {
  private re: Float32Array;
  private im: Float32Array;
  private win: Float32Array;
  readonly mag: Float32Array;

  constructor(readonly size: number) {
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.win = hann(size);
    this.mag = new Float32Array(size / 2 + 1);
  }

  /** Windows + transforms `frame` (length === size), returns the shared `mag`. */
  compute(frame: Float32Array): Float32Array {
    const { re, im, win, mag } = this;
    for (let i = 0; i < this.size; i++) {
      re[i] = frame[i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(re[k], im[k]);
    return mag;
  }
}

/** RMS level of a frame (linear amplitude). */
export function rms(frame: Float32Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / frame.length);
}

/**
 * Spectral flatness (Wiener entropy) = geometric mean / arithmetic mean of the
 * power spectrum, in [0,1]. Near 1 → noise-like (flat); near 0 → tonal (peaky).
 */
export function spectralFlatness(mag: Float32Array): number {
  let logSum = 0;
  let arithSum = 0;
  let n = 0;
  const eps = 1e-12;
  for (let k = 1; k < mag.length; k++) {
    const p = mag[k] * mag[k] + eps;
    logSum += Math.log(p);
    arithSum += p;
    n++;
  }
  if (n === 0 || arithSum <= 0) return 1;
  const geo = Math.exp(logSum / n);
  const arith = arithSum / n;
  return geo / arith;
}
