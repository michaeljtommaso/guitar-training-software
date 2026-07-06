// ponytail: synthetic default cab IR — a lowpassed, exponentially decaying
// noise burst with a direct spike. Sounds "speaker-ish", is license-clean and
// deterministic. Swap in a real CC0 IR file via the loader when tone matters.
// dsp/synth.ts has a seeded whiteNoise, but synth is test-only by contract
// (never shipped) — this file ships, so it carries its own 5-line xorshift.
export function makeDefaultCabIR(sampleRate: number, durationS = 0.06): Float32Array {
  const n = Math.floor(sampleRate * durationS);
  const ir = new Float32Array(n);
  const fc = 4200; // cab-ish top end
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
  let lp = 0;
  let seed = 0x2f6e2b1 | 0; // xorshift32 — deterministic across runs
  for (let i = 0; i < n; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    lp += a * (noise - lp);
    ir[i] = lp * Math.exp(-i / (sampleRate * 0.012));
  }
  ir[0] = 1; // direct spike preserves pick attack
  let e = 0;
  for (let i = 0; i < n; i++) e += ir[i] * ir[i];
  const g = 1 / Math.sqrt(e);
  for (let i = 0; i < n; i++) ir[i] *= g;
  return ir;
}
