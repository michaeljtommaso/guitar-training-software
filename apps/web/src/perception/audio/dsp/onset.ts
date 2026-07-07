// Spectral-flux onset detector (own DSP, license-clean — replaces the NC/GPL
// toolkits per ADR-005). Half-wave-rectified spectral flux with a median-based
// adaptive threshold and causal peak-picking.
//
// Pipeline per analysis frame:
//   flux[n] = Σ_k max(0, |X_n[k]| - |X_{n-1}[k]|)          (half-wave rectified)
//   thr[n]  = median(flux over trailing window) * mult + delta
//   onset   = flux[n-1] is a strict local max AND ≥ thr[n-1] AND past refractory
// One-frame confirmation delay (peak at n-1 confirmed once frame n is seen) →
// ~1 hop of latency (~5 ms at 256/48k), well inside the audio budget (§14).
import { MagnitudeSpectrum, rms } from "./fft";
import { SILENCE_RMS } from "./chords";

export interface OnsetEvent {
  /** Time of the onset (ms), on whatever clock the caller stamps frames with. */
  t: number;
  /** Raw spectral-flux value at the peak (unnormalized). */
  strength: number;
  /** Confidence in [0,1]: margin of the peak over its adaptive threshold. */
  conf: number;
}

export interface OnsetConfig {
  /** Trailing frames used for the median adaptive threshold. */
  medianWindow?: number;
  /** Threshold multiplier on the running median. */
  multiplier?: number;
  /** Additive threshold floor (guards against silence → tiny median). */
  delta?: number;
  /** Refractory period (ms) — suppresses double-triggers on one transient. */
  minGapMs?: number;
  /** Frame RMS below this → onset suppressed (silence gate). Defaults to the
   *  shared {@link SILENCE_RMS}. */
  silenceRms?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

export class OnsetDetector {
  private prevMag: Float32Array | null = null;
  private history: number[] = []; // trailing flux for the median threshold
  // Last two confirmed frames (for local-max peak picking with 1-frame delay).
  // `level` is the frame's time-domain RMS — carried so the silence gate acts on
  // the SAME frame that is peak-picked (n-1), not the one currently arriving.
  private f1 = { flux: 0, thr: 0, t: 0, level: Infinity }; // n-2
  private f2 = { flux: 0, thr: 0, t: 0, level: Infinity }; // n-1
  private count = 0;
  private lastOnsetT = -Infinity;

  private readonly medianWindow: number;
  private readonly multiplier: number;
  private readonly delta: number;
  private readonly minGapMs: number;
  private readonly silenceRms: number;

  constructor(cfg: OnsetConfig = {}) {
    this.medianWindow = cfg.medianWindow ?? 16;
    this.multiplier = cfg.multiplier ?? 1.6;
    this.delta = cfg.delta ?? 1e-4;
    this.minGapMs = cfg.minGapMs ?? 50;
    this.silenceRms = cfg.silenceRms ?? SILENCE_RMS;
  }

  /**
   * Feed one magnitude spectrum with its frame time (ms). `level` is the frame's
   * time-domain RMS — when it is below the silence floor the onset is SUPPRESSED
   * (BUG-001 req 1): the flux threshold is purely relative, so on an idle mic the
   * noise floor otherwise fires phantom onsets continuously. `level` defaults to
   * Infinity (no gate) for callers that only have the spectrum.
   * Returns an onset if the *previous* frame is now confirmed as a peak.
   */
  process(mag: Float32Array, tMs: number, level = Infinity): OnsetEvent | null {
    // 1. Spectral flux vs previous frame.
    let flux = 0;
    if (this.prevMag) {
      for (let k = 0; k < mag.length; k++) {
        const d = mag[k] - this.prevMag[k];
        if (d > 0) flux += d;
      }
    } else {
      this.prevMag = new Float32Array(mag.length);
    }
    this.prevMag.set(mag);

    // 2. Adaptive threshold from the trailing median (includes current flux).
    this.history.push(flux);
    if (this.history.length > this.medianWindow) this.history.shift();
    const thr = median(this.history) * this.multiplier + this.delta;

    // 3. Peak-pick the middle frame (n-1) now that we can see n-2, n-1, n.
    let onset: OnsetEvent | null = null;
    if (this.count >= 2) {
      const isPeak =
        this.f2.level >= this.silenceRms && // silence gate (BUG-001 req 1)
        this.f2.flux > this.f1.flux &&
        this.f2.flux >= flux &&
        this.f2.flux >= this.f2.thr &&
        this.f2.t - this.lastOnsetT >= this.minGapMs;
      if (isPeak) {
        const margin = (this.f2.flux - this.f2.thr) / (this.f2.flux + 1e-12);
        onset = { t: this.f2.t, strength: this.f2.flux, conf: Math.max(0, Math.min(1, margin)) };
        this.lastOnsetT = this.f2.t;
      }
    }

    // 4. Shift the frame window.
    this.f1 = this.f2;
    this.f2 = { flux, thr, t: tMs, level };
    this.count++;
    return onset;
  }
}

export interface AnalyzeOnsetsOptions extends OnsetConfig {
  fftSize?: number;
  hop?: number;
}

/**
 * Offline convenience: frame a whole signal, run the detector, return onsets.
 * Frames are timestamped at their center. Node-testable entry point.
 */
export function analyzeOnsets(
  signal: Float32Array,
  sampleRate: number,
  opts: AnalyzeOnsetsOptions = {},
): OnsetEvent[] {
  const fftSize = opts.fftSize ?? 1024;
  const hop = opts.hop ?? 256;
  const spec = new MagnitudeSpectrum(fftSize);
  const det = new OnsetDetector(opts);
  const frame = new Float32Array(fftSize);
  const events: OnsetEvent[] = [];
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    frame.set(signal.subarray(start, start + fftSize));
    const mag = spec.compute(frame);
    const tMs = ((start + fftSize / 2) / sampleRate) * 1000;
    const ev = det.process(mag, tMs, rms(frame));
    if (ev) events.push(ev);
  }
  return events;
}
