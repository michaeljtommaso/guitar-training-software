// Notes worker: runs Basic Pitch on ~2 s chunks off the hot path (TF.js is
// heavy; §14 treats polyphonic notes as near-real-time, not per-frame). The
// worker (and thus the TF.js bundle) is only ever constructed when notes are
// enabled, so a static import is enough — no need for in-worker code-splitting.
// All failures are contained and reported — a notes-worker crash must not take
// down the perception loop.
import { BasicPitchNoteSource } from "./basicPitchSource";
import type { NotesEvent } from "./NoteSource";

type InMsg =
  | { type: "init"; modelUrl?: string }
  | { type: "chunk"; samples: Float32Array; sampleRate: number; startTimeMs: number };

type OutMsg =
  | { type: "notes"; events: NotesEvent[] }
  | { type: "notesReady" }
  | { type: "notesError"; error: string };

let source: BasicPitchNoteSource | null = null;
let busy = false;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m);
  try {
    if (msg.type === "init") {
      source ??= new BasicPitchNoteSource(msg.modelUrl);
      post({ type: "notesReady" });
    } else if (msg.type === "chunk") {
      // Drop chunks that arrive while inference is running (back-pressure) —
      // near-real-time, not a queue that grows unbounded.
      if (busy || !source) return;
      busy = true;
      try {
        const events = await source.analyze(msg.samples, msg.sampleRate, msg.startTimeMs);
        post({ type: "notes", events });
      } finally {
        busy = false;
      }
    }
  } catch (err) {
    post({ type: "notesError", error: err instanceof Error ? err.message : String(err) });
  }
};
