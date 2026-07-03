// Module-level perception store (ADR-002 consequence): 30 fps perception
// state NEVER flows through React. The overlay reads `hot` directly inside
// its frame callback; React components read the coarse `snapshot` (updated
// ~2 Hz by worker stat messages) via useSyncExternalStore.
export interface AudioStats {
  framesRead: number;
  samplesConsumed: number;
  dropped: number;
  latencyMs: number;
}

export interface PerceptionSnapshot {
  audio: AudioStats | null;
  backend: "webgpu" | "wasm" | null;
  frameDriver: "rvfc" | "raf" | null;
  visionFrames: number;
}

/** Per-frame hot state — mutated directly, never notifies React. */
export const hot = { rvfcTicks: 0, fps: 0 };

let snapshot: PerceptionSnapshot = {
  audio: null,
  backend: null,
  frameDriver: null,
  visionFrames: 0,
};
const listeners = new Set<() => void>();

export function getSnapshot(): PerceptionSnapshot {
  return snapshot;
}

export function setPerception(patch: Partial<PerceptionSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
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
