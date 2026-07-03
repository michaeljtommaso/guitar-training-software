// Module-level perception store (ADR-002 consequence): 30 fps perception
// state NEVER flows through React. The overlay reads `hot` directly inside
// its frame callback; React components read the coarse `snapshot` (updated at
// worker cadence) via useSyncExternalStore.
import type { AnalyzerState } from "./audio/analysis";
import type { AudioEvent } from "../fusion/audioEvents";
import type { NotesEvent } from "./audio/notes/NoteSource";

export interface AudioStats {
  framesRead: number;
  samplesConsumed: number;
  dropped: number;
  latencyMs: number;
}

export interface AudioEventCounts {
  onset: number;
  chord: number;
  notes: number;
  tuning: number;
}

export interface PerceptionSnapshot {
  audio: AudioStats | null;
  backend: "webgpu" | "wasm" | null;
  frameDriver: "rvfc" | "raf" | null;
  visionFrames: number;
  /** Latest WP-2 audio analysis (chord posterior, tuner reading, last onset). */
  audioAnalysis: AnalyzerState | null;
  /** Latest Basic Pitch notes event. */
  notes: NotesEvent | null;
  /** Last onset time (audio-clock ms) — drives the overlay onset marker. */
  lastOnsetT: number;
  /** Cumulative counts per event kind (observed by the e2e). */
  eventCounts: AudioEventCounts;
}

/** Per-frame hot state — mutated directly, never notifies React. */
export const hot = { rvfcTicks: 0, fps: 0 };

let snapshot: PerceptionSnapshot = {
  audio: null,
  backend: null,
  frameDriver: null,
  visionFrames: 0,
  audioAnalysis: null,
  notes: null,
  lastOnsetT: NaN,
  eventCounts: { onset: 0, chord: 0, notes: 0, tuning: 0 },
};
const listeners = new Set<() => void>();

export function getSnapshot(): PerceptionSnapshot {
  return snapshot;
}

export function setPerception(patch: Partial<PerceptionSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/** Fold a batch of audio events into the coarse snapshot (counts + last onset). */
export function recordAudioEvents(events: AudioEvent[]): void {
  if (!events.length) return;
  const counts = { ...snapshot.eventCounts };
  let lastOnsetT = snapshot.lastOnsetT;
  for (const e of events) {
    counts[e.kind]++;
    if (e.kind === "onset") lastOnsetT = e.t;
  }
  setPerception({ eventCounts: counts, lastOnsetT });
}

/** Record a Basic Pitch notes event (from the notes worker). */
export function recordNotes(event: NotesEvent): void {
  const counts = { ...snapshot.eventCounts };
  counts.notes++;
  setPerception({ notes: event, eventCounts: counts });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Debug/e2e hook — lets the fake-device smoke test observe the pipeline
// without threading state through the DOM.
declare global {
  interface Window {
    __captureDebug?: { snapshot(): PerceptionSnapshot; hot: typeof hot };
  }
}
if (typeof window !== "undefined") {
  window.__captureDebug = { snapshot: getSnapshot, hot };
}
