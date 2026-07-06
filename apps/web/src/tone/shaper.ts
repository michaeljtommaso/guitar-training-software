// Drive curve for a native WaveShaperNode: y = tanh(kx)/tanh(k), normalized so
// ±1 maps to ±1. Odd length keeps an exact zero at x=0 (no DC). Anti-aliasing
// is the node's job (oversample: "4x") — research doc §6.
export function makeDriveCurve(amount: number, n = 2049): Float32Array {
  // ponytail deviation from plan: plan's k = 1 + 24*amount leaves the curve
  // audibly nonlinear even at amount=0 (k=1 still compresses), so the
  // harmonic-growth test's 10x floor never clears (measured ratio ~7x).
  // k = 0.1 + 24.9*amount keeps the same amount=1 ceiling (k=25) but starts
  // near-linear at amount=0, matching the "no drive → clean" intent the test encodes.
  const k = 0.1 + 24.9 * Math.min(1, Math.max(0, amount));
  const norm = Math.tanh(k);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
