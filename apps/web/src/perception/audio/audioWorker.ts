// Audio worker: the single consumer of the SPSC ring buffer. Drains frames on
// a short poll, runs the WP-2 own-DSP analysis (spectral-flux onset, chroma →
// chord template match, YIN tuner) over a hop-windowed stream, and accumulates
// ~2 s chunks for Basic Pitch notes (transcribed off the hot path by the notes
// worker). Posts perception events + coarse state + ring stats to the main
// thread.
//
// CLOCK-DOMAIN BRIDGING (glass-to-worker latency): the worklet stamps each
// frame with the audio clock (currentTime) and Date.now(); latency here is
// Date.now()-wallMs (structurally non-negative, no cross-clock conversion).
// DSP event times use the audio-clock stamp, which is exact. Full notes in
// ringBuffer.ts.
import {
  attachRingBuffer,
  popFrame,
  FRAME_SAMPLES,
  RING_CAPACITY,
  IDX_DROPPED,
  type RingView,
} from "./ringBuffer";
import { AudioAnalyzer, FFT_SIZE, HOP, type AnalyzerState } from "./analysis";
import type { AudioEvent } from "../../fusion/events/audioEvents";

export interface AudioWorkerStats {
  type: "audioStats";
  framesRead: number;
  samplesConsumed: number;
  dropped: number;
  latencyMs: number;
}

export interface AudioEventsMsg {
  type: "audioEvents";
  events: AudioEvent[];
  // Clock anchor: the last drained frame's audio-clock and wall-clock stamps —
  // sampled TOGETHER in the worklet (ringBuffer dual stamps). Lets the main
  // thread map wall↔audio to bridge the vision leg's clock without a third
  // origin (see fusionStore.ts CLOCK BRIDGING).
  clockAudioMs: number;
  clockWallMs: number;
}

export interface AudioStateMsg {
  type: "audioState";
  state: AnalyzerState;
}

export interface NotesChunkMsg {
  type: "notesChunk";
  samples: Float32Array;
  sampleRate: number;
  startTimeMs: number;
}

const HOP_FRAMES = HOP / FRAME_SAMPLES; // 256/128 = 2 render quanta per hop
const NOTES_CHUNK_SEC = 2;

let ring: RingView | null = null;
let analyzer: AudioAnalyzer | null = null;
let sampleRate = 48000;
let framesRead = 0;
let samplesConsumed = 0;
let latencyMs = NaN; // EMA of per-frame glass-to-worker latency
// Last drained frame's together-sampled (audio-clock, wall-clock) stamps —
// the wall↔audio anchor forwarded with each audioEvents batch (clock bridging).
let lastFrameStampMs = NaN;
let lastFrameWallMs = NaN;
const scratch = new Float32Array(FRAME_SAMPLES);

// Hop windowing: a rolling FFT-sized window advanced one render quantum at a
// time; the analyzer runs once every HOP_FRAMES.
const win = new Float32Array(FFT_SIZE);
let framesSinceHop = 0;

// Notes accumulation: a contiguous ~2 s buffer posted to the notes worker.
let notesBuf = new Float32Array(NOTES_CHUNK_SEC * sampleRate);
let notesIdx = 0;
let notesChunkStartMs = 0;

let pendingEvents: AudioEvent[] = [];
let lastStatePostMs = 0;

function post(msg: AudioWorkerStats | AudioEventsMsg | AudioStateMsg | NotesChunkMsg): void {
  (self as unknown as Worker).postMessage(
    msg,
    msg.type === "notesChunk" ? [msg.samples.buffer] : [],
  );
}

function drain(): void {
  if (!ring || !analyzer) return;
  for (;;) {
    const frame = popFrame(ring, scratch);
    if (frame === null) break;
    framesRead++;
    samplesConsumed += FRAME_SAMPLES;
    lastFrameStampMs = frame.stampMs;
    lastFrameWallMs = frame.wallMs;
    const lat = Date.now() - frame.wallMs;
    latencyMs = Number.isFinite(latencyMs) ? latencyMs + 0.2 * (lat - latencyMs) : lat;

    // Roll the analysis window forward by one render quantum.
    win.copyWithin(0, FRAME_SAMPLES);
    win.set(scratch, FFT_SIZE - FRAME_SAMPLES);
    if (++framesSinceHop >= HOP_FRAMES) {
      framesSinceHop = 0;
      const { events } = analyzer.pushWindow(win, frame.stampMs);
      if (events.length) pendingEvents.push(...events);
    }

    // Accumulate the notes chunk.
    if (notesIdx === 0) notesChunkStartMs = frame.stampMs;
    notesBuf.set(scratch, notesIdx);
    notesIdx += FRAME_SAMPLES;
    if (notesIdx >= notesBuf.length) {
      post({ type: "notesChunk", samples: notesBuf.slice(0, notesIdx), sampleRate, startTimeMs: notesChunkStartMs });
      notesIdx = 0;
    }
  }

  if (pendingEvents.length) {
    // pendingEvents only accrue while draining frames, so the anchor stamps
    // (set in the loop above) are finite here.
    post({
      type: "audioEvents",
      events: pendingEvents,
      clockAudioMs: lastFrameStampMs,
      clockWallMs: lastFrameWallMs,
    });
    pendingEvents = [];
  }
  const now = Date.now();
  if (now - lastStatePostMs >= 100) {
    lastStatePostMs = now;
    post({ type: "audioState", state: analyzer.getState() });
  }
}

function postStats(): void {
  if (!ring) return;
  post({
    type: "audioStats",
    framesRead,
    samplesConsumed,
    dropped: Atomics.load(ring.header, IDX_DROPPED),
    latencyMs,
  });
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type?: string; sab?: SharedArrayBuffer; sampleRate?: number };
  if (msg.type === "init" && msg.sab) {
    sampleRate = msg.sampleRate ?? 48000;
    ring = attachRingBuffer(msg.sab, RING_CAPACITY);
    analyzer = new AudioAnalyzer(sampleRate);
    notesBuf = new Float32Array(NOTES_CHUNK_SEC * sampleRate);
    notesIdx = 0;
    // ponytail: 15 ms poll ≈ 5-6 render quanta of headroom against the 683 ms
    // ring; switch to an Atomics.wait loop if poll jitter ever matters.
    setInterval(drain, 15);
    setInterval(postStats, 500);
  }
};
