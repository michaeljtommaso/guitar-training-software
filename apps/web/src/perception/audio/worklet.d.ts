// Minimal AudioWorkletGlobalScope ambient types — not in lib.dom.
// Only capture-processor.ts runs in that scope; these globals do not exist
// on the main thread or in workers, so nothing else should reference them.
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

declare function registerProcessor(name: string, processorCtor: unknown): void;
