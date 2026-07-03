// Audio worker: the single consumer of the SPSC ring buffer. Drains frames on
// a short poll and posts periodic stats to the main thread.
//
// CLOCK-DOMAIN BRIDGING (glass-to-worker latency)
// The worklet lives on the audio clock (AudioContext.currentTime) and has no
// `performance`; this worker lives on its own performance timeline. The one
// clock both agents share directly is Date (the Unix epoch IS the shared
// epoch), so the worklet stamps each frame with Date.now() at write and the
// latency here is simply Date.now() at read minus that stamp — no cross-clock
// conversion, structurally non-negative.
//
// Why not an audio-clock<->wall epoch pair sampled on the main thread? Tried
// and measured biased both ways: sampled right after resume() the audio
// clock has not started moving (latency inflated by the context start-up
// gap, ~100s of ms under a slow fake sink), and sampled later the main
// thread's currentTime read is stale by up to one hardware buffer (~10 ms —
// enough to push real ~5 ms latencies negative). Full notes in ringBuffer.ts.
//
// ponytail: Date.now() is ~1 ms resolution and can step under NTP slew; the
// EMA absorbs single spikes. Good for a stats readout, not for DSP alignment
// — DSP alignment uses the audio-clock stamp, which is exact.
import {
  attachRingBuffer,
  popFrame,
  FRAME_SAMPLES,
  RING_CAPACITY,
  IDX_DROPPED,
  type RingView,
} from "./ringBuffer";

export interface AudioWorkerStats {
  type: "audioStats";
  framesRead: number;
  samplesConsumed: number;
  dropped: number;
  latencyMs: number;
}

let ring: RingView | null = null;
let framesRead = 0;
let samplesConsumed = 0;
let latencyMs = NaN; // EMA of per-frame glass-to-worker latency
const scratch = new Float32Array(FRAME_SAMPLES);

function drain(): void {
  if (!ring) return;
  for (;;) {
    const frame = popFrame(ring, scratch);
    if (frame === null) break;
    framesRead++;
    samplesConsumed += FRAME_SAMPLES;
    const lat = Date.now() - frame.wallMs;
    latencyMs = Number.isFinite(latencyMs) ? latencyMs + 0.2 * (lat - latencyMs) : lat;
  }
}

function postStats(): void {
  if (!ring) return;
  const stats: AudioWorkerStats = {
    type: "audioStats",
    framesRead,
    samplesConsumed,
    dropped: Atomics.load(ring.header, IDX_DROPPED),
    latencyMs,
  };
  postMessage(stats);
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type?: string; sab?: SharedArrayBuffer };
  if (msg.type === "init" && msg.sab) {
    ring = attachRingBuffer(msg.sab, RING_CAPACITY);
    // ponytail: 15 ms poll ≈ 5-6 render quanta of headroom against the 683 ms
    // ring; switch to an Atomics.wait loop if poll jitter ever matters.
    setInterval(drain, 15);
    setInterval(postStats, 500);
  }
};
