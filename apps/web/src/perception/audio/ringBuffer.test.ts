// @vitest-environment node
// Pure ring-buffer logic tests — node env has native SharedArrayBuffer/Atomics.
import { describe, expect, it } from "vitest";
import {
  attachRingBuffer,
  ringBufferByteLength,
  pushFrame,
  popFrame,
  FRAME_SAMPLES,
  IDX_WRITE,
  IDX_READ,
  IDX_DROPPED,
} from "./ringBuffer";

function makeRing(capacity: number) {
  return attachRingBuffer(new SharedArrayBuffer(ringBufferByteLength(capacity)), capacity);
}

function frame(fill: number): Float32Array {
  const f = new Float32Array(FRAME_SAMPLES);
  f.fill(fill);
  return f;
}

describe("SPSC ring buffer", () => {
  it("round-trips frames with sample data and both stamps intact", () => {
    const ring = makeRing(8);
    const out = new Float32Array(FRAME_SAMPLES);

    pushFrame(ring, frame(0.25), 100, 1_750_000_000_000);
    pushFrame(ring, frame(-0.5), 102.6875, 1_750_000_000_003);

    expect(popFrame(ring, out)).toEqual({ stampMs: 100, wallMs: 1_750_000_000_000 });
    expect(out[0]).toBeCloseTo(0.25);
    expect(out[FRAME_SAMPLES - 1]).toBeCloseTo(0.25);

    expect(popFrame(ring, out)).toEqual({ stampMs: 102.6875, wallMs: 1_750_000_000_003 });
    expect(out[0]).toBeCloseTo(-0.5);

    expect(popFrame(ring, out)).toBeNull();
    expect(Atomics.load(ring.header, IDX_DROPPED)).toBe(0);
  });

  it("handles wrap-around correctly", () => {
    const cap = 4;
    const ring = makeRing(cap);
    const out = new Float32Array(FRAME_SAMPLES);

    for (let i = 0; i < cap; i++) pushFrame(ring, frame(i), i, 1000 + i);
    expect(popFrame(ring, out)?.stampMs).toBe(0);
    expect(popFrame(ring, out)?.stampMs).toBe(1);
    // These two land in physical slots 0 and 1 — past the wrap point.
    pushFrame(ring, frame(4), 4, 1004);
    pushFrame(ring, frame(5), 5, 1005);

    for (let i = 2; i <= 5; i++) {
      expect(popFrame(ring, out)).toEqual({ stampMs: i, wallMs: 1000 + i });
      expect(out[FRAME_SAMPLES - 1]).toBeCloseTo(i);
    }
    expect(popFrame(ring, out)).toBeNull();
    expect(Atomics.load(ring.header, IDX_DROPPED)).toBe(0);
  });

  it("overrun drops the oldest frames and counts them", () => {
    const cap = 4;
    const ring = makeRing(cap);
    const out = new Float32Array(FRAME_SAMPLES);

    for (let i = 0; i < 6; i++) pushFrame(ring, frame(i), i, 1000 + i);

    expect(Atomics.load(ring.header, IDX_DROPPED)).toBe(2);
    // Oldest two (0, 1) were dropped; 2..5 survive in order.
    for (let i = 2; i <= 5; i++) {
      expect(popFrame(ring, out)?.stampMs).toBe(i);
      expect(out[0]).toBeCloseTo(i);
    }
    expect(popFrame(ring, out)).toBeNull();
  });

  it("atomics counters are monotonic — indices never go backwards", () => {
    const ring = makeRing(4);
    const out = new Float32Array(FRAME_SAMPLES);
    let lastW = 0;
    let lastR = 0;
    let lastD = 0;

    const check = () => {
      const w = Atomics.load(ring.header, IDX_WRITE);
      const r = Atomics.load(ring.header, IDX_READ);
      const d = Atomics.load(ring.header, IDX_DROPPED);
      expect(w).toBeGreaterThanOrEqual(lastW);
      expect(r).toBeGreaterThanOrEqual(lastR);
      expect(d).toBeGreaterThanOrEqual(lastD);
      expect(r).toBeLessThanOrEqual(w);
      expect(w - r).toBeLessThanOrEqual(ring.capacity);
      lastW = w;
      lastR = r;
      lastD = d;
    };

    for (let i = 0; i < 50; i++) {
      pushFrame(ring, frame(i), i, 1000 + i);
      check();
      if (i % 3 === 0) {
        popFrame(ring, out);
        check();
      }
    }
  });

  it("zero-pads short input blocks", () => {
    const ring = makeRing(2);
    const out = new Float32Array(FRAME_SAMPLES).fill(9);

    pushFrame(ring, new Float32Array([1, 2, 3]), 7, 1007);
    expect(popFrame(ring, out)?.stampMs).toBe(7);
    expect(out[2]).toBe(3);
    expect(out[3]).toBe(0);
    expect(out[FRAME_SAMPLES - 1]).toBe(0);
  });
});
