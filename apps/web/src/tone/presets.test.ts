// Preset-shape + invariant locks (TP-2 style). New presets must stay inside the
// TonePanel knob ranges and carry a valid monitor mode; the Mic Input preset
// must actually encode its mic-tuning intent (low drive, strong gate, LP/HP-ish
// EQ cuts) so a future edit can't silently regress it.
import { describe, expect, it } from "vitest";
import { TONE_PRESETS } from "./presets";
import { DEFAULT_TONE, type ToneParams } from "./toneChain";

// Ranges mirror TonePanel's KNOBS min/max — a preset outside these is a bug.
const RANGES: Record<Exclude<keyof ToneParams, "monitor">, [number, number]> = {
  trimDb: [-24, 24],
  gateDb: [-90, -30],
  drive: [0, 1],
  bassDb: [-12, 12],
  midDb: [-12, 12],
  trebleDb: [-12, 12],
  presenceDb: [-12, 12],
  volumeDb: [-60, 0],
};

describe("TONE_PRESETS", () => {
  it("every preset is a complete, in-range ToneParams with a valid monitor", () => {
    for (const [name, p] of Object.entries(TONE_PRESETS)) {
      expect(["off", "dry", "amp"], name).toContain(p.monitor);
      for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
        const [lo, hi] = RANGES[key];
        expect(typeof p[key], `${name}.${key}`).toBe("number");
        expect(p[key], `${name}.${key}`).toBeGreaterThanOrEqual(lo);
        expect(p[key], `${name}.${key}`).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe("Mic Input preset (RESULT-003 mic tuning)", () => {
  const mic = TONE_PRESETS["Mic Input"];

  it("exists", () => {
    expect(mic).toBeDefined();
  });

  it("uses very low drive so mic/room noise is not distorted into crunch", () => {
    expect(mic.drive).toBeLessThan(0.15);
    expect(mic.drive).toBeLessThan(TONE_PRESETS["Crunch Rhythm"].drive);
  });

  it("gates more aggressively than the default tone", () => {
    // Higher (less negative) threshold = stronger gate.
    expect(mic.gateDb).toBeGreaterThan(DEFAULT_TONE.gateDb);
  });

  it("cuts lows (≈ high-pass) and highs (≈ low-pass) to tame rumble and hiss", () => {
    expect(mic.bassDb).toBeLessThan(0);
    expect(mic.trebleDb).toBeLessThan(0);
    expect(mic.presenceDb).toBeLessThanOrEqual(0);
  });

  it("keeps a moderate, non-blasting volume", () => {
    expect(mic.volumeDb).toBeLessThanOrEqual(-6);
    expect(mic.volumeDb).toBeGreaterThanOrEqual(-24);
  });
});
