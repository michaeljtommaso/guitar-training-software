// Pure downsampling for the waveform strip: reduces a full-resolution audio
// channel to `numBuckets` [min,max] pairs so a canvas of any pixel width can
// draw a min/max envelope in O(numBuckets), not O(samples).
export interface MinMaxBucket {
  min: number;
  max: number;
}

export function computeMinMaxBuckets(samples: Float32Array, numBuckets: number): MinMaxBucket[] {
  if (numBuckets <= 0) return [];
  const perBucket = samples.length / numBuckets;
  const out: MinMaxBucket[] = new Array(numBuckets);
  for (let b = 0; b < numBuckets; b++) {
    const start = Math.floor(b * perBucket);
    const end = Math.max(start + 1, Math.floor((b + 1) * perBucket));
    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i < end && i < samples.length; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) {
      min = 0;
      max = 0;
    }
    out[b] = { min, max };
  }
  return out;
}
