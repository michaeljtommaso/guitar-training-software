// Decodes a local video file's audio track for the waveform/spectrogram
// strips. Browser-only (AudioContext + decodeAudioData); jsdom has no real
// Web Audio implementation so this is exercised manually, not by vitest.
// ponytail: no unit test here — the pure math it feeds (waveformBuckets.ts,
// spectrogram.ts) IS unit tested; this function is a thin browser-API
// wrapper. Add a jsdom mock if this wrapper grows real logic.
export interface DecodedAudio {
  channel: Float32Array; // mono, first channel
  sampleRate: number;
  duration: number;
}

export async function decodeVideoAudio(file: File): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    return {
      channel: buffer.getChannelData(0),
      sampleRate: buffer.sampleRate,
      duration: buffer.duration,
    };
  } finally {
    void ctx.close();
  }
}
