// AudioAnalyzer — coordinates the own-DSP legs (spectral-flux onset, chroma →
// chord template match, YIN tuner) over the windowed ring-buffer stream and
// emits AudioEvents (§9.1). Basic Pitch polyphonic notes run in their own
// worker (tfjs is heavy) and are merged downstream, so this stays pure,
// light, and Node-testable.
import { MagnitudeSpectrum, rms, spectralFlatness } from "./dsp/fft";
import { computeChroma } from "./dsp/chroma";
import { ChordMatcher, type ChordResult } from "./dsp/chords";
import { OnsetDetector, type OnsetConfig } from "./dsp/onset";
import { YinTunerSource, type TuningReading, type YinOptions } from "./dsp/tuner";
import type { AudioEvent } from "../../fusion/events/audioEvents";

export const FFT_SIZE = 1024; // onset: short window → good time resolution
export const HOP = 256;
// Chroma / chord / tuner need frequency resolution the 1024 onset window can't
// give (≈47 Hz bins fold low guitar notes onto the wrong pitch class), so they
// run off a long rolling buffer: 8192 @ 48k ≈ 5.9 Hz bins / 170 ms — resolves
// open low-E and is a stable chord-analysis window (§14 chord budget 150–300 ms).
const LONG_FFT = 8192;
const LONG_EVERY_HOPS = 8; // re-analyze chord+tuner ~ every 8 hops (~43 ms)

export interface AudioAnalyzerOptions {
  fftSize?: number;
  hop?: number;
  onset?: OnsetConfig;
  tuner?: YinOptions;
}

export interface AnalyzerState {
  chord: ChordResult | null;
  tuning: TuningReading | null;
  lastOnsetT: number;
}

export interface AnalyzerOutput {
  events: AudioEvent[];
  state: AnalyzerState;
}

export class AudioAnalyzer {
  private readonly fftSize: number;
  private readonly hop: number;
  private readonly spec: MagnitudeSpectrum;
  private readonly longSpec: MagnitudeSpectrum;
  private readonly onset: OnsetDetector;
  private readonly chords = new ChordMatcher();
  private readonly tunerSource: YinTunerSource;

  private readonly longBuf = new Float32Array(LONG_FFT);
  private longFilled = 0;
  private hopCount = 0;

  private state: AnalyzerState = { chord: null, tuning: null, lastOnsetT: NaN };

  constructor(
    readonly sampleRate: number,
    opts: AudioAnalyzerOptions = {},
  ) {
    this.fftSize = opts.fftSize ?? FFT_SIZE;
    this.hop = opts.hop ?? HOP;
    this.spec = new MagnitudeSpectrum(this.fftSize);
    this.longSpec = new MagnitudeSpectrum(LONG_FFT);
    this.onset = new OnsetDetector(opts.onset);
    this.tunerSource = new YinTunerSource(opts.tuner);
  }

  /**
   * Process one analysis window (length === fftSize) stamped at `tMs` (audio
   * clock). Windows advance by `hop`; the caller supplies overlapping frames.
   * Returns the AudioEvents produced this hop plus the latest debug state.
   */
  pushWindow(window: Float32Array, tMs: number): AnalyzerOutput {
    const events: AudioEvent[] = [];

    // --- onset (short window, every hop) -------------------------------------
    const mag = this.spec.compute(window);
    const on = this.onset.process(mag, tMs);
    if (on) {
      events.push({ t: on.t, kind: "onset", strength: on.strength, conf: on.conf });
      this.state.lastOnsetT = on.t;
    }

    // --- chord + tuner (long window, lower cadence) --------------------------
    this.appendLong(window.subarray(this.fftSize - this.hop));
    if (++this.hopCount % LONG_EVERY_HOPS === 0 && this.longFilled >= this.longBuf.length) {
      const longMag = this.longSpec.compute(this.longBuf);
      const level = rms(this.longBuf);
      const flat = spectralFlatness(longMag);
      const chroma = computeChroma(longMag, this.sampleRate, LONG_FFT);
      const chord = this.chords.process(chroma, level, flat);
      const prevLabel = this.state.chord?.label;
      this.state.chord = chord;
      if (chord.label !== prevLabel) {
        events.push({ t: tMs, kind: "chord", label: chord.label, conf: chord.conf });
      }

      const reading = this.tunerSource.detect(this.longBuf, this.sampleRate);
      this.state.tuning = reading;
      if (reading) {
        events.push({ t: tMs, kind: "tuning", string: reading.string, cents: reading.cents });
      }
    }

    return { events, state: this.state };
  }

  getState(): AnalyzerState {
    return this.state;
  }

  // Rolling-append the newest `hop` samples into the long buffer (shift-left).
  private appendLong(newSamples: Float32Array): void {
    const n = newSamples.length;
    const buf = this.longBuf;
    buf.copyWithin(0, n);
    buf.set(newSamples, buf.length - n);
    this.longFilled = Math.min(this.longFilled + n, buf.length);
  }
}

/**
 * Offline convenience: run the full analyzer over a whole signal, framing it
 * into overlapping windows. Node-testable entry for the plumbing proof.
 */
export function analyzeSignal(
  signal: Float32Array,
  sampleRate: number,
  opts: AudioAnalyzerOptions = {},
): { events: AudioEvent[]; final: AnalyzerState } {
  const fftSize = opts.fftSize ?? FFT_SIZE;
  const hop = opts.hop ?? HOP;
  const analyzer = new AudioAnalyzer(sampleRate, opts);
  const frame = new Float32Array(fftSize);
  const events: AudioEvent[] = [];
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    frame.set(signal.subarray(start, start + fftSize));
    const tMs = ((start + fftSize / 2) / sampleRate) * 1000;
    events.push(...analyzer.pushWindow(frame, tMs).events);
  }
  return { events, final: analyzer.getState() };
}
