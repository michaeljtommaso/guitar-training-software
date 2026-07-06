// Noise-gate math, pure and Node-testable; gate-processor.ts is a thin shell.
// Envelope follower + smoothed open/close — no native Web Audio gate exists,
// so this is the one piece of custom realtime DSP in the tone chain.
export interface GateState {
  env: number;
  gain: number;
}

/** One-pole smoothing coefficient for a time constant in ms. */
export function gateCoef(ms: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / ((ms / 1000) * sampleRate));
}

export function gateStep(
  s: GateState,
  x: number,
  thresholdLin: number,
  attack: number,
  release: number,
  envCoef: number,
): number {
  s.env += envCoef * (Math.abs(x) - s.env);
  const target = s.env >= thresholdLin ? 1 : 0;
  s.gain += (target > s.gain ? attack : release) * (target - s.gain);
  return x * s.gain;
}
