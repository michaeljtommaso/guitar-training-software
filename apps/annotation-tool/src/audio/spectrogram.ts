// STFT magnitude frames for the spectrogram strip, built on the copied fft.ts
// (shared/fft.ts — see that file's provenance header). Hops a fixed-size
// window across the channel and returns one magnitude-spectrum row per hop;
// the canvas layer maps rows/bins to a heatmap.
import { MagnitudeSpectrum } from "../shared/fft";

export interface SpectrogramResult {
  frames: Float32Array[]; // one magnitudeSpectrum per hop, each length windowSize/2+1
  hopSeconds: number;
}

export function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  windowSize = 1024,
  hopSize = 256,
): SpectrogramResult {
  const spectrum = new MagnitudeSpectrum(windowSize);
  const frames: Float32Array[] = [];
  const frame = new Float32Array(windowSize);
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    frame.set(samples.subarray(start, start + windowSize));
    frames.push(Float32Array.from(spectrum.compute(frame)));
  }
  return { frames, hopSeconds: hopSize / sampleRate };
}
