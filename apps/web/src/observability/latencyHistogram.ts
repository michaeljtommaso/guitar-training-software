// Local-first latency histograms (WP-7, §15/§16). Fixed-bucket distribution +
// exact p50/p95 over a capped ring of recent samples. Module-level singletons —
// perception threads record into them; the debug panels READ p50/p95 at their
// coarse render cadence, never per frame (ADR-002).
//
// No network, no Sentry, no PII: these are on-device counters only. The §16
// "latency budgets are CI gates" live in eval-smoke; THIS is the live readout.

// Upper edges (ms). A sample counts in the first bucket whose edge it is ≤.
// Anything larger falls in the implicit overflow bucket (edge = Infinity).
export const LATENCY_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100, 250, 500] as const;

export interface Bucket {
  /** Inclusive upper edge in ms (Infinity = overflow). */
  le: number;
  count: number;
}

export class LatencyHistogram {
  private samples: number[] = [];
  constructor(private readonly cap = 512) {}

  /** Record one latency sample (ms). Non-finite values are ignored. */
  record(ms: number): void {
    if (!Number.isFinite(ms)) return;
    this.samples.push(ms);
    if (this.samples.length > this.cap) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  /** Exact nearest-rank quantile over the retained samples (NaN when empty). */
  quantile(q: number): number {
    const n = this.samples.length;
    if (n === 0) return NaN;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const rank = Math.ceil(Math.min(1, Math.max(0, q)) * n);
    return sorted[Math.max(0, rank - 1)];
  }

  get p50(): number {
    return this.quantile(0.5);
  }
  get p95(): number {
    return this.quantile(0.95);
  }

  /** Fixed-edge bucket counts (+ Infinity overflow bucket) over the samples. */
  buckets(): Bucket[] {
    const edges = [...LATENCY_BUCKETS_MS, Infinity];
    const out: Bucket[] = edges.map((le) => ({ le, count: 0 }));
    for (const s of this.samples) {
      const i = edges.findIndex((le) => s <= le);
      out[i === -1 ? out.length - 1 : i].count++;
    }
    return out;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

// The two §16 loops surfaced in the debug panels.
/** Fusion ingest-batch → hint-emit latency (ms, main thread). */
export const fusionHintHistogram = new LatencyHistogram();
/** Audio glass-to-worker latency (ms) — the WP-1 ring-buffer measurement. */
export const audioGlassToWorkerHistogram = new LatencyHistogram();
