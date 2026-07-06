import { describe, expect, it } from "vitest";
import { makeDefaultCabIR } from "./cabIR";
import { magnitudeSpectrum } from "../perception/audio/dsp/fft"; // existing WP-2 scaffolding

describe("makeDefaultCabIR", () => {
  it("is deterministic and unit-energy", () => {
    const a = makeDefaultCabIR(48000);
    const b = makeDefaultCabIR(48000);
    expect(Array.from(a.slice(0, 16))).toEqual(Array.from(b.slice(0, 16)));
    let e = 0;
    for (let i = 0; i < a.length; i++) e += a[i] * a[i];
    expect(e).toBeCloseTo(1, 3);
  });
  it("decays: last quarter holds <5% of first-quarter energy", () => {
    const ir = makeDefaultCabIR(48000);
    const q = Math.floor(ir.length / 4);
    const energy = (s: number, n: number) => {
      let e = 0;
      for (let i = s; i < s + n; i++) e += ir[i] * ir[i];
      return e;
    };
    expect(energy(3 * q, q)).toBeLessThan(0.05 * energy(0, q));
  });
  it("rolls off highs like a cab: 8kHz+ well below 200Hz–1kHz", () => {
    const ir = makeDefaultCabIR(48000);
    const N = 4096;
    const padded = new Float32Array(N);
    padded.set(ir.subarray(0, Math.min(ir.length, N)));
    const mag = magnitudeSpectrum(padded);
    const band = (lo: number, hi: number) => {
      const b0 = Math.floor((lo * N) / 48000);
      const b1 = Math.ceil((hi * N) / 48000);
      let s = 0;
      for (let i = b0; i <= b1; i++) s += mag[i] * mag[i];
      return s / (b1 - b0 + 1);
    };
    expect(band(8000, 16000)).toBeLessThan(0.2 * band(200, 1000));
  });
});
