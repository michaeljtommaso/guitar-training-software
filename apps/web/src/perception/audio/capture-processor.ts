// AudioWorkletProcessor (realtime audio thread): copies each 128-sample input
// quantum (mono, channel 0) into the shared SPSC ring buffer, stamped with the
// audio clock (`currentTime`, converted to ms). No allocation and no
// postMessage on the hot path — the only cross-thread channel is the SAB.
//
// Each frame carries two stamps: the audio-clock time of the render quantum
// (quantized to 128/48000 s ≈ 2.7 ms, the durable perception timeline) and
// Date.now() at write. AudioWorkletGlobalScope has no `performance`, but Date
// is an ECMAScript intrinsic available in every agent — see the clock notes
// in ringBuffer.ts and audioWorker.ts.
import { attachRingBuffer, pushFrame, RING_CAPACITY, type RingView } from "./ringBuffer";

class CaptureProcessor extends AudioWorkletProcessor {
  private ring: RingView;

  constructor(options: { processorOptions?: { sab?: SharedArrayBuffer } }) {
    super();
    const sab = options.processorOptions?.sab;
    if (!sab) throw new Error("capture-processor: processorOptions.sab is required");
    this.ring = attachRingBuffer(sab, RING_CAPACITY);
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) pushFrame(this.ring, ch, currentTime * 1000, Date.now());
    return true; // keep alive; outputs stay silent (zeros)
  }
}

registerProcessor("capture-processor", CaptureProcessor);
