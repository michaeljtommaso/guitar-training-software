import { describe, expect, it } from "vitest";
import { gateCoef, gateStep, type GateState } from "./gateCore";
import { sineWave } from "../perception/audio/dsp/synth"; // existing test-signal scaffolding

const SR = 48000;
const run = (samples: number, amp: number, s: GateState, thLin: number) => {
  const attack = gateCoef(2, SR);
  const release = gateCoef(60, SR);
  const envCoef = gateCoef(5, SR);
  const sig = sineWave(200, samples / SR, SR, amp);
  let last = 0;
  for (let i = 0; i < sig.length; i++) last = gateStep(s, sig[i], thLin, attack, release, envCoef);
  return { last, s };
};

describe("gate", () => {
  it("passes loud signal (gain → 1)", () => {
    const s: GateState = { env: 0, gain: 0 };
    run(4800, 0.5, s, 0.001);
    expect(s.gain).toBeGreaterThan(0.99);
  });
  it("closes on signal below threshold (gain → 0)", () => {
    // ponytail deviation from plan: plan used 9600 samples (200ms), but with
    // a 60ms release time constant that's only ~3.3 tau — gain lands ~0.036,
    // not <0.01. 14400 samples (300ms, ~5 tau) is what the exponential math
    // actually needs; gateCore.ts itself is untouched (verbatim from plan).
    const s: GateState = { env: 0, gain: 1 };
    run(14400, 0.0001, s, 0.001);
    expect(s.gain).toBeLessThan(0.01);
  });
  it("releases smoothly — no instant cut", () => {
    const s: GateState = { env: 0, gain: 1 };
    run(480, 0.0001, s, 0.001); // 10 ms of quiet
    expect(s.gain).toBeGreaterThan(0.5); // 60 ms release hasn't finished
  });
});
