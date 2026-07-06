// Acoustic round-trip latency probe ("clap test"). Emits sharp clicks straight
// to ctx.destination (NOT through the tone chain) and pairs each click with the
// onset the analysis path reports back, measuring the full loop: output +
// speaker→air→mic + capture + DSP.
//
// CLOCK: onset events carry `t = currentTime * 1000` — the AudioWorklet audio
// clock (capture-processor.ts stamps `currentTime * 1000`; audioWorker forwards
// it as the onset `t`). We schedule each click at an AudioContext time and
// record that same `startTime * 1000`, so clicks and onsets share one clock and
// one origin (the capture AudioContext). No cross-clock arithmetic.

export const MATCH_WINDOW_MS = 500;

/**
 * Pair each click with the first not-yet-used onset that lands AFTER it within
 * MATCH_WINDOW_MS; return the round-trip deltas (ms). Unmatched clicks dropped;
 * each onset is consumed once so overlapping windows don't double-count.
 */
export function pairClicksToOnsets(clicksMs: number[], onsetsMs: number[]): number[] {
  const clicks = [...clicksMs].sort((a, b) => a - b);
  const onsets = [...onsetsMs].sort((a, b) => a - b);
  const deltas: number[] = [];
  let j = 0;
  for (const c of clicks) {
    while (j < onsets.length && onsets[j] <= c) j++; // onset must be strictly after the click
    if (j < onsets.length && onsets[j] <= c + MATCH_WINDOW_MS) {
      deltas.push(onsets[j] - c);
      j++; // consume this onset
    }
  }
  return deltas;
}

/** Median of the samples, or null when empty. */
export function medianMs(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface RoundTripOpts {
  /** Number of clicks to emit (default 3). */
  clicks?: number;
  /** Gap between clicks, ms (default 700 — wider than MATCH_WINDOW_MS). */
  gapMs?: number;
  /**
   * Subscribe to detected onset times (audio-clock ms). Returns an unsubscribe.
   * The caller wires this to the perception snapshot's `lastOnsetT`.
   */
  subscribeOnsets(cb: (tMs: number) => void): () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A ~5 ms decaying broadband burst — sharp enough to fire the spectral-flux
// onset detector. ponytail: Math.random noise is fine for a stimulus (never
// analyzed as truth); it just needs a wide, transient spectrum.
function emitClick(ctx: AudioContext, at: number): void {
  const n = Math.max(1, Math.round(ctx.sampleRate * 0.005));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (1 - i / n) * (Math.random() * 2 - 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(ctx.destination); // straight out — bypasses the tone chain
  src.start(at);
  src.stop(at + n / ctx.sampleRate);
}

/**
 * Emit N clicks and return the median round-trip ms, or null if fewer than 2
 * clicks were matched to onsets (e.g. headphones, no acoustic loopback).
 */
export async function measureRoundTrip(ctx: AudioContext, opts: RoundTripOpts): Promise<number | null> {
  const clicks = opts.clicks ?? 3;
  const gapMs = opts.gapMs ?? 700;
  const clickTimesMs: number[] = [];
  const onsetTimesMs: number[] = [];
  const unsub = opts.subscribeOnsets((t) => onsetTimesMs.push(t));
  try {
    const leadMs = 150; // schedule the first click slightly ahead
    for (let i = 0; i < clicks; i++) {
      const at = ctx.currentTime + (leadMs + i * gapMs) / 1000;
      emitClick(ctx, at);
      clickTimesMs.push(at * 1000); // same clock/origin as onset `t`
    }
    await sleep(leadMs + clicks * gapMs + MATCH_WINDOW_MS);
  } finally {
    unsub();
  }
  const deltas = pairClicksToOnsets(clickTimesMs, onsetTimesMs);
  return deltas.length >= 2 ? medianMs(deltas) : null;
}
