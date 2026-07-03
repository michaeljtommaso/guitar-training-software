import { describe, it, expect } from "vitest";
import { analyzeOnsets } from "./onset";
import { harmonicNote, whiteNoise, placeAt, mix, resetNoiseSeed } from "./synth";

const SR = 48000;

describe("spectral-flux onset detector (synthetic)", () => {
  it("detects a single plucked-note onset near its true time", () => {
    // A note that starts at 0.5 s in an otherwise silent 1.2 s buffer.
    const note = harmonicNote(196, 0.6, SR, { decayTau: 0.25, amp: 0.8 });
    const signal = placeAt(note, 0.5, 1.2, SR);
    const onsets = analyzeOnsets(signal, SR);
    expect(onsets.length).toBeGreaterThanOrEqual(1);
    // Nearest detected onset to the true 500 ms.
    const err = Math.min(...onsets.map((o) => Math.abs(o.t - 500)));
    expect(err).toBeLessThan(35); // synthetic timing tolerance
    console.log(`[onset][synthetic] single-note onset timing error = ${err.toFixed(1)} ms`);
  });

  it("detects a burst onset above a noise floor", () => {
    resetNoiseSeed();
    const floor = whiteNoise(1.2, SR, 0.02);
    const burst = harmonicNote(147, 0.5, SR, { decayTau: 0.3, amp: 0.9 });
    const signal = mix(floor, placeAt(burst, 0.5, 1.2, SR));
    const onsets = analyzeOnsets(signal, SR, { multiplier: 1.8 });
    expect(onsets.length).toBeGreaterThanOrEqual(1);
    const err = Math.min(...onsets.map((o) => Math.abs(o.t - 500)));
    expect(err).toBeLessThan(40);
    console.log(`[onset][synthetic] burst-in-noise onset timing error = ${err.toFixed(1)} ms`);
  });

  it("finds three onsets for three spaced plucks", () => {
    let signal: Float32Array = new Float32Array(Math.floor(1.8 * SR));
    for (const at of [0.3, 0.9, 1.4]) {
      signal = mix(signal, placeAt(harmonicNote(220, 0.4, SR, { decayTau: 0.2 }), at, 1.8, SR));
    }
    const onsets = analyzeOnsets(signal, SR);
    expect(onsets.length).toBeGreaterThanOrEqual(3);
  });
});
