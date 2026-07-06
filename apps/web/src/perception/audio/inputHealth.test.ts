import { describe, expect, it } from "vitest";
import { InputHealthMeter } from "./inputHealth";
import { sineWave } from "./dsp/synth"; // existing test-signal scaffolding

// One 128-sample worklet quantum of a 1.5 kHz tone (4 full cycles @ 48 kHz).
const frame = (amp: number) => sineWave(1500, 128 / 48000, 48000, amp);

describe("InputHealthMeter", () => {
  it("tracks RMS and peak of a steady tone", () => {
    const m = new InputHealthMeter();
    for (let i = 0; i < 500; i++) m.push(frame(0.5));
    const h = m.read();
    // sine RMS = amp/√2 → 0.354 ≈ -9 dBFS
    expect(h.rmsDb).toBeGreaterThan(-12);
    expect(h.rmsDb).toBeLessThan(-6);
    expect(h.peakDb).toBeGreaterThan(-7);
    expect(h.clipped).toBe(false);
  });
  it("latches clipping until read, then clears", () => {
    const m = new InputHealthMeter();
    m.push(frame(1.0)); // |s| ≥ 0.99 present
    expect(m.read().clipped).toBe(true);
    m.push(frame(0.1));
    expect(m.read().clipped).toBe(false);
  });
  it("noise floor settles near the quiet level and rises only slowly", () => {
    const m = new InputHealthMeter();
    for (let i = 0; i < 2000; i++) m.push(frame(0.001)); // ≈ -63 dBFS quiet bed
    const quiet = m.read().noiseFloorDb;
    expect(quiet).toBeLessThan(-50);
    for (let i = 0; i < 200; i++) m.push(frame(0.5)); // short loud burst
    expect(m.read().noiseFloorDb).toBeLessThan(quiet + 6); // floor barely moves
  });
});
