// Lock-free SPSC ring buffer over a SharedArrayBuffer.
// Single producer: the AudioWorklet (capture-processor, realtime audio thread).
// Single consumer: the audio worker.
//
// Byte layout (all regions 8-byte aligned):
//   [0 .. 32)                  Float64 x4 : epoch slots, reserved (see note below)
//   [32 .. 48)                 Int32  x4 : writeCount, readCount, droppedCount, reserved
//   [48 .. 48+cap*8)           Float64   : per-slot write timestamps (audio-clock ms)
//   [.. +cap*8)                Float64   : per-slot write timestamps (wall-clock ms, Date.now())
//   [.. +cap*FRAME_SAMPLES*4)  Float32   : per-slot sample data
//
// CLOCKS — each frame carries TWO producer stamps:
//   - stampMs: the audio clock (AudioWorkletGlobalScope currentTime, ms) —
//     the durable timeline that perception events align to in WP-2+.
//   - wallMs: Date.now() at write. Date is the one clock every agent
//     (worklet/worker/main) shares directly, so glass-to-worker latency is
//     simply consumerDateNow - wallMs with NO epoch conversion. A
//     main-thread-sampled audio<->wall epoch was tried first and measured
//     biased both ways: right after resume() the audio clock has not started
//     (latency inflated ~100s of ms), and later currentTime reads on the
//     main thread are stale by up to one hardware buffer (~10 ms, enough to
//     push real ~5 ms latencies negative). The epoch f64 slots stay reserved
//     for WP-2's audio-clock->wall mapping, which can be built from
//     (stampMs, wallMs) pairs already in-band.
//
// writeCount/readCount/droppedCount are MONOTONIC (never wrapped, never
// decremented — slot = count % capacity). Publication order: the producer
// writes slot data with plain stores, then Atomics.store(writeCount) — the
// seq-cst atomic gives the consumer a happens-before edge to the slot data.
//
// Overrun policy: drop-oldest. When full, the producer CASes readCount
// forward one slot and counts a drop; if the consumer advanced readCount
// concurrently, the CAS fails and space exists anyway (nothing dropped).
// The consumer copies a slot and only then CASes readCount — if the CAS
// fails, the producer drop-oldest overwrote that slot mid-copy, so the
// (possibly torn) copy is discarded and the read retried. Torn data is
// therefore never surfaced.
//
// ponytail: 32-bit monotonic counters overflow after ~2^31 frames — at 375
// frames/s that is ~66 days of continuous capture; add wrap handling if
// sessions ever approach that.

export const FRAME_SAMPLES = 128; // WebAudio render quantum
export const RING_CAPACITY = 256; // ~683 ms of audio @ 48 kHz

const EPOCH_F64S = 4;
const HEADER_I32S = 4;
const HEADER_BYTES = EPOCH_F64S * 8 + HEADER_I32S * 4; // 48

export const IDX_WRITE = 0;
export const IDX_READ = 1;
export const IDX_DROPPED = 2;

export interface RingView {
  capacity: number;
  /** Reserved epoch slots (future audio-clock<->wall mapping, WP-2). */
  epoch: Float64Array;
  /** Monotonic counters: [IDX_WRITE], [IDX_READ], [IDX_DROPPED]. */
  header: Int32Array;
  /** Per-slot audio-clock write stamps (ms). */
  stamps: Float64Array;
  /** Per-slot wall-clock write stamps (Date.now() ms). */
  wallStamps: Float64Array;
  samples: Float32Array;
}

export function ringBufferByteLength(capacity: number = RING_CAPACITY): number {
  return HEADER_BYTES + capacity * 16 + capacity * FRAME_SAMPLES * 4;
}

export function attachRingBuffer(
  sab: SharedArrayBuffer,
  capacity: number = RING_CAPACITY,
): RingView {
  return {
    capacity,
    epoch: new Float64Array(sab, 0, EPOCH_F64S),
    header: new Int32Array(sab, EPOCH_F64S * 8, HEADER_I32S),
    stamps: new Float64Array(sab, HEADER_BYTES, capacity),
    wallStamps: new Float64Array(sab, HEADER_BYTES + capacity * 8, capacity),
    samples: new Float32Array(sab, HEADER_BYTES + capacity * 16, capacity * FRAME_SAMPLES),
  };
}

/**
 * Producer side (worklet only). Copies `src` (short blocks are zero-padded,
 * long ones truncated to FRAME_SAMPLES) into the next slot, stamped with the
 * producer's audio-clock time and wall-clock time in ms. No allocation —
 * realtime-audio safe.
 */
export function pushFrame(
  view: RingView,
  src: Float32Array,
  stampMs: number,
  wallMs: number,
): void {
  const { header, capacity } = view;
  const w = Atomics.load(header, IDX_WRITE);
  const r = Atomics.load(header, IDX_READ);
  if (w - r >= capacity) {
    // Full → drop oldest. CAS failure means the consumer freed a slot first.
    if (Atomics.compareExchange(header, IDX_READ, r, r + 1) === r) {
      Atomics.add(header, IDX_DROPPED, 1);
    }
  }
  const slot = w % capacity;
  const base = slot * FRAME_SAMPLES;
  const n = Math.min(src.length, FRAME_SAMPLES);
  view.samples.set(n === src.length ? src : src.subarray(0, n), base);
  for (let i = n; i < FRAME_SAMPLES; i++) view.samples[base + i] = 0;
  view.stamps[slot] = stampMs;
  view.wallStamps[slot] = wallMs;
  Atomics.store(header, IDX_WRITE, w + 1); // publish
}

export interface PoppedFrame {
  /** Producer audio-clock write stamp (ms). */
  stampMs: number;
  /** Producer wall-clock write stamp (Date.now() ms). */
  wallMs: number;
}

/**
 * Consumer side (audio worker only). Copies the oldest frame into `out`
 * (length >= FRAME_SAMPLES) and returns its producer stamps, or null when
 * the buffer is empty.
 */
export function popFrame(view: RingView, out: Float32Array): PoppedFrame | null {
  const { header, capacity } = view;
  for (;;) {
    const r = Atomics.load(header, IDX_READ);
    const w = Atomics.load(header, IDX_WRITE);
    if (r === w) return null;
    const slot = r % capacity;
    const stampMs = view.stamps[slot];
    const wallMs = view.wallStamps[slot];
    out.set(view.samples.subarray(slot * FRAME_SAMPLES, slot * FRAME_SAMPLES + FRAME_SAMPLES));
    if (Atomics.compareExchange(header, IDX_READ, r, r + 1) === r) return { stampMs, wallMs };
    // Lost the slot to the producer's drop-oldest while copying — retry.
  }
}
