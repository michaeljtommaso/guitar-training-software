// Polyphonic note-transcription interface. The shipped implementation is
// Basic Pitch (real Apache-2.0 model, §7 / ADR-005); this interface is the seam
// an onnxruntime-web Basic Pitch/CREPE path slots behind once a validated ONNX
// export + featurization lands (see DEVIATIONS in the WP-2 report).
import type { AudioEvent } from "../../../fusion/events/audioEvents";

/** A `notes` AudioEvent (§9.1): MIDI pitches sounding at time `t` (audio ms). */
export type NotesEvent = Extract<AudioEvent, { kind: "notes" }>;

export interface NoteSource {
  /**
   * Transcribe one mono chunk. `startTimeMs` offsets emitted event times onto
   * the audio clock (the chunk's first-sample timestamp). Returns note-onset
   * events, polyphonic (pitches that start together are grouped).
   */
  analyze(mono: Float32Array, sampleRate: number, startTimeMs?: number): Promise<NotesEvent[]>;
}

/** Linear-interpolation resampler (mono). Cheap and adequate for AMT input. */
export function resampleLinear(input: Float32Array, fromSr: number, toSr: number): Float32Array {
  if (fromSr === toSr) return input;
  const ratio = toSr / fromSr;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  const lastIdx = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, lastIdx);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}
