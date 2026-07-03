// Basic Pitch polyphonic note transcription (Spotify, Apache-2.0) — a REAL
// model actually running via its bundled TF.js GraphModel weights.
//
// DEVIATION from ADR-005's letter (onnxruntime-web WebGPU EP): a validated
// Basic Pitch ONNX export + its harmonic-CQT featurization and note-creation
// post-processing could not be assembled within the overnight timebox, so the
// blessed fallback — the real @spotify/basic-pitch package — is used behind the
// NoteSource seam. It runs the genuine model; only the runtime (TF.js WebGL/CPU
// vs ORT WebGPU) deviates. See the WP-2 report DEVIATIONS.
import { BasicPitch, outputToNotesPoly, noteFramesToTime } from "@spotify/basic-pitch";
import type { NoteEventTime } from "@spotify/basic-pitch";
import { resampleLinear, type NoteSource, type NotesEvent } from "./NoteSource";

/** Basic Pitch's fixed model input sample rate. */
export const BASIC_PITCH_SR = 22050;

/** Group notes whose onsets fall within `windowMs` into one polyphonic event. */
function groupByOnset(notes: NoteEventTime[], startTimeMs: number, windowMs = 70): NotesEvent[] {
  const sorted = [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const events: NotesEvent[] = [];
  let curT = -Infinity;
  let pitches: number[] = [];
  let amps: number[] = [];
  const flush = () => {
    if (!pitches.length) return;
    const conf = Math.max(0, Math.min(1, amps.reduce((a, b) => a + b, 0) / amps.length));
    events.push({ t: curT, kind: "notes", pitches: [...new Set(pitches)].sort((a, b) => a - b), conf });
  };
  for (const n of sorted) {
    const tMs = startTimeMs + n.startTimeSeconds * 1000;
    if (tMs - curT > windowMs) {
      flush();
      curT = tMs;
      pitches = [];
      amps = [];
    }
    pitches.push(n.pitchMidi);
    amps.push(n.amplitude);
  }
  flush();
  return events;
}

export interface BasicPitchOptions {
  /** onset posteriorgram threshold (Basic Pitch default 0.5). */
  onsetThresh?: number;
  /** frame posteriorgram threshold (default 0.3). */
  frameThresh?: number;
  /** minimum note length in frames (default 5). */
  minNoteFrames?: number;
}

export class BasicPitchNoteSource implements NoteSource {
  private readonly bp: BasicPitch;
  constructor(
    modelUrlOrModel: string | Promise<unknown> = "/models/basic-pitch/model.json",
    private readonly opts: BasicPitchOptions = {},
  ) {
    // BasicPitch accepts a model URL or a Promise<tf.GraphModel>; the loose
    // Promise type keeps callers from needing a direct @tensorflow/tfjs import.
    this.bp = new BasicPitch(modelUrlOrModel as string);
  }

  async analyze(mono: Float32Array, sampleRate: number, startTimeMs = 0): Promise<NotesEvent[]> {
    const resampled = resampleLinear(mono, sampleRate, BASIC_PITCH_SR);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await this.bp.evaluateModel(
      resampled,
      (f, o) => {
        for (const row of f) frames.push(row);
        for (const row of o) onsets.push(row);
      },
      () => {},
    );
    const notes = noteFramesToTime(
      outputToNotesPoly(
        frames,
        onsets,
        this.opts.onsetThresh ?? 0.5,
        this.opts.frameThresh ?? 0.3,
        this.opts.minNoteFrames ?? 5,
      ),
    );
    return groupByOnset(notes, startTimeMs);
  }
}
