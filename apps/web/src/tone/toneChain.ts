// Wet monitoring chain (ADR-013): all native Web Audio nodes + the gate
// worklet. Fans out from the SAME MediaStreamAudioSourceNode the dry analysis
// taps — the correctness path never sees this graph.
//
//  source → trim ─→ gate → shaper(4x) → bass → mid → treble → presence → cab ─→ limiter → volume → monitor → destination
//                └──────────────────────── dryTap (clean DI mode) ───────────┘
import { makeDriveCurve } from "./shaper";
import { makeDefaultCabIR } from "./cabIR";
import gateProcessorUrl from "./gate-processor.ts?worker&url";

export type MonitorMode = "off" | "dry" | "amp";

export interface ToneParams {
  monitor: MonitorMode;
  trimDb: number;
  gateDb: number;
  drive: number;
  bassDb: number;
  midDb: number;
  trebleDb: number;
  presenceDb: number;
  volumeDb: number;
}

export const DEFAULT_TONE: ToneParams = {
  monitor: "off",
  trimDb: 0,
  gateDb: -60,
  drive: 0.3,
  bassDb: 0,
  midDb: 0,
  trebleDb: 0,
  presenceDb: 0,
  volumeDb: -12,
};

export interface ToneChainHandles {
  setParams(p: ToneParams): void;
  loadIR(data: ArrayBuffer): Promise<void>;
  latencyMs(): number;
  outputRms(): number;
  dispose(): void;
}

const lin = (db: number) => Math.pow(10, db / 20);

export async function buildToneChain(ctx: AudioContext, source: AudioNode): Promise<ToneChainHandles> {
  await ctx.audioWorklet.addModule(gateProcessorUrl);

  const trim = new GainNode(ctx, { gain: 1 });
  const gate = new AudioWorkletNode(ctx, "gate-processor");
  const shaper = new WaveShaperNode(ctx, { curve: makeDriveCurve(DEFAULT_TONE.drive), oversample: "4x" });
  const bass = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 120 });
  const mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 650, Q: 0.8 });
  const treble = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3200 });
  const presence = new BiquadFilterNode(ctx, { type: "peaking", frequency: 4500, Q: 0.7 });
  const cab = new ConvolverNode(ctx, { disableNormalization: false });
  // ponytail: helpers return the wide Float32Array<ArrayBufferLike>; DOM setters
  // want <ArrayBuffer>. Values are ArrayBuffer-backed at runtime — cast, don't copy.
  const irData = makeDefaultCabIR(ctx.sampleRate) as Float32Array<ArrayBuffer>;
  const irBuf = ctx.createBuffer(1, irData.length, ctx.sampleRate);
  irBuf.copyToChannel(irData, 0);
  cab.buffer = irBuf;
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.1 });
  const volume = new GainNode(ctx, { gain: lin(DEFAULT_TONE.volumeDb) });
  const monitor = new GainNode(ctx, { gain: 0 }); // monitor defaults OFF
  const wetHead = new GainNode(ctx, { gain: 1 }); // amp-path enable
  const dryTap = new GainNode(ctx, { gain: 0 }); // clean-DI-path enable
  const analyser = new AnalyserNode(ctx, { fftSize: 2048 });
  const analyserBuf = new Float32Array(analyser.fftSize);

  source.connect(trim);
  trim.connect(wetHead);
  wetHead.connect(gate);
  gate.connect(shaper);
  shaper.connect(bass);
  bass.connect(mid);
  mid.connect(treble);
  treble.connect(presence);
  presence.connect(cab);
  cab.connect(limiter);
  trim.connect(dryTap);
  dryTap.connect(limiter);
  limiter.connect(volume);
  volume.connect(monitor);
  monitor.connect(analyser);
  monitor.connect(ctx.destination);

  let lastDrive = DEFAULT_TONE.drive;

  return {
    setParams(p: ToneParams) {
      trim.gain.value = lin(p.trimDb);
      gate.port.postMessage({ thresholdDb: p.gateDb });
      if (p.drive !== lastDrive) {
        lastDrive = p.drive;
        shaper.curve = makeDriveCurve(p.drive) as Float32Array<ArrayBuffer>; // allocation OK: control-rate, not audio callback
      }
      bass.gain.value = p.bassDb;
      mid.gain.value = p.midDb;
      treble.gain.value = p.trebleDb;
      presence.gain.value = p.presenceDb;
      volume.gain.value = lin(p.volumeDb);
      wetHead.gain.value = p.monitor === "amp" ? 1 : 0;
      dryTap.gain.value = p.monitor === "dry" ? 1 : 0;
      monitor.gain.value = p.monitor === "off" ? 0 : 1;
    },
    async loadIR(data: ArrayBuffer) {
      cab.buffer = await ctx.decodeAudioData(data);
    },
    latencyMs() {
      return (ctx.baseLatency + (ctx.outputLatency ?? 0)) * 1000;
    },
    outputRms() {
      analyser.getFloatTimeDomainData(analyserBuf);
      let sq = 0;
      for (let i = 0; i < analyserBuf.length; i++) sq += analyserBuf[i] * analyserBuf[i];
      return Math.sqrt(sq / analyserBuf.length);
    },
    dispose() {
      source.disconnect(trim);
      monitor.disconnect();
    },
  };
}
