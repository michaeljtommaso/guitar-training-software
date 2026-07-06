// Input health for the setup wizard (ADR-013): level, decaying peak, clip
// latch, and a slow lower-envelope noise floor. Pure and Node-testable; the
// audio worker feeds it each 128-sample frame and reads it at stats cadence.
// Level math reuses the WP-2 DSP scaffolding (dsp/fft.ts rms).
import { rms } from "./dsp/fft";

export interface InputHealth {
  rmsDb: number;
  peakDb: number;
  clipped: boolean;
  noiseFloorDb: number;
}

const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

export class InputHealthMeter {
  private meanSq = 0; // EMA of per-frame mean-square (~50 ms @ 128-sample frames)
  private peak = 0; // decaying peak
  private clipCount = 0;
  private floorDb = NaN; // lower envelope: follows drops fast, rises very slowly

  push(frame: Float32Array): void {
    let pk = 0;
    for (let i = 0; i < frame.length; i++) {
      const a = Math.abs(frame[i]);
      if (a > pk) pk = a;
      if (a >= 0.99) this.clipCount++;
    }
    const r = rms(frame); // existing helper — don't re-derive
    this.meanSq += 0.05 * (r * r - this.meanSq);
    this.peak = Math.max(pk, this.peak * 0.9995);
    const rDb = db(Math.sqrt(this.meanSq));
    if (!Number.isFinite(this.floorDb)) this.floorDb = rDb;
    else this.floorDb += (rDb < this.floorDb ? 0.2 : 0.0005) * (rDb - this.floorDb);
  }

  read(): InputHealth {
    const h: InputHealth = {
      rmsDb: db(Math.sqrt(this.meanSq)),
      peakDb: db(this.peak),
      clipped: this.clipCount > 0,
      noiseFloorDb: Number.isFinite(this.floorDb) ? this.floorDb : -180,
    };
    this.clipCount = 0; // clip latch clears on read
    return h;
  }
}
