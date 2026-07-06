// Realtime shell around gateCore (audio thread): mono in → gated mono out.
// Threshold arrives via port message; no allocation on the hot path.
import { gateCoef, gateStep, type GateState } from "./gateCore";

class GateProcessor extends AudioWorkletProcessor {
  private st: GateState = { env: 0, gain: 1 };
  private thresholdLin = Math.pow(10, -60 / 20);
  private readonly attack = gateCoef(2, sampleRate);
  private readonly release = gateCoef(60, sampleRate);
  private readonly envCoef = gateCoef(5, sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const db = (e.data as { thresholdDb?: number }).thresholdDb;
      if (typeof db === "number") this.thresholdLin = Math.pow(10, db / 20);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (inp && out)
      for (let i = 0; i < inp.length; i++)
        out[i] = gateStep(this.st, inp[i], this.thresholdLin, this.attack, this.release, this.envCoef);
    return true;
  }
}

registerProcessor("gate-processor", GateProcessor);
