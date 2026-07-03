// Trust-preserving feedback policy (§9.3, ADR-007). Deterministic — time
// comes from diagnosis timestamps, never a clock.
//
// - At most ONE correction per window (default 1.5 s): diagnoses buffer up
//   inside the window; when it elapses the buffer is ranked and ONE candidate
//   may become a hint.
// - FALSE-POSITIVE-AVERSE confidence gates: below `confidentGate` a hint is
//   ALWAYS hedged ("Likely …") — a wrong confident correction costs more
//   trust than a missed one; below `hedgeGate` → silence.
// - Ranking, exactly §9.3: confidence → pedagogical importance (the lesson
//   step's feedback_priority order) → user benefit (severity) →
//   non-repetition (recently-given codes deprioritized) → actionability.
// - `ok` never becomes a correction (its nudge flag stays on the diagnosis).
import type { Diagnosis, DiagnosisCode } from "./diagnosis";

export interface PolicyConfig {
  /** Rate-limit window between hints (ms). */
  windowMs: number;
  /** conf ≥ this → a confident correction is allowed. */
  confidentGate: number;
  /** hedgeGate ≤ conf < confidentGate → hedged hint; below → silence. */
  hedgeGate: number;
  /** A code given within this window counts as "recently given". */
  repeatMs: number;
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  windowMs: 1500,
  confidentGate: 0.55,
  hedgeGate: 0.35,
  repeatMs: 6000,
};

export interface Hint {
  t: number;
  code: DiagnosisCode;
  text: string;
  /** true → below the confident gate; phrased as "Likely …", never a confident correction. */
  hedged: boolean;
  conf: number;
  severity: number;
}

/** Fixed actionability per code (§9.3 final tiebreak): how directly a beginner
 *  can act on it. */
const ACTIONABILITY: Record<DiagnosisCode, number> = {
  wrong_fret: 0.9,
  wrong_string: 0.9,
  muted_string: 0.8,
  behind_fret: 0.7,
  missing_note: 0.6,
  late_strum: 0.5,
  ok: 0,
};

export class FeedbackPolicy {
  readonly cfg: PolicyConfig;
  private buffer: Diagnosis[] = [];
  private lastHintT = -Infinity;
  private priority: readonly string[] = [];
  private recent = new Map<DiagnosisCode, number>(); // code → last hint t

  constructor(cfg: Partial<PolicyConfig> = {}) {
    this.cfg = { ...DEFAULT_POLICY_CONFIG, ...cfg };
  }

  /** Set the current lesson step's feedback_priority (pedagogical importance). */
  setPriority(codes: readonly string[]): void {
    this.priority = codes;
  }

  /**
   * Offer one diagnosis. Returns a hint only when the rate-limit window has
   * elapsed AND the best buffered candidate clears the confidence gates.
   */
  push(d: Diagnosis): Hint | null {
    if (d.code !== "ok") this.buffer.push(d);
    if (d.t - this.lastHintT < this.cfg.windowMs) return null;
    if (this.buffer.length === 0) return null;

    const best = this.buffer.reduce((a, b) => (this.compare(a, b) <= 0 ? a : b));
    this.buffer = [];
    if (best.conf < this.cfg.hedgeGate) return null; // silence over speculation

    const hedged = best.conf < this.cfg.confidentGate;
    this.lastHintT = d.t;
    this.recent.set(best.code, d.t);
    return {
      t: d.t,
      code: best.code,
      text: hedged ? `Likely: ${phrase(best)}` : phrase(best),
      hedged,
      conf: best.conf,
      severity: best.severity,
    };
  }

  /** §9.3 ranking comparator — negative when `a` outranks `b`. */
  private compare(a: Diagnosis, b: Diagnosis): number {
    // 1. confidence
    if (a.conf !== b.conf) return b.conf - a.conf;
    // 2. pedagogical importance (index in the step's feedback_priority)
    const pa = this.priorityRank(a.code);
    const pb = this.priorityRank(b.code);
    if (pa !== pb) return pa - pb;
    // 3. user benefit
    if (a.severity !== b.severity) return b.severity - a.severity;
    // 4. non-repetition — not-recently-given first
    const ra = this.recentlyGiven(a) ? 1 : 0;
    const rb = this.recentlyGiven(b) ? 1 : 0;
    if (ra !== rb) return ra - rb;
    // 5. actionability
    return ACTIONABILITY[b.code] - ACTIONABILITY[a.code];
  }

  private priorityRank(code: DiagnosisCode): number {
    const i = this.priority.indexOf(code);
    return i === -1 ? this.priority.length : i;
  }

  private recentlyGiven(d: Diagnosis): boolean {
    const last = this.recent.get(d.code);
    return last !== undefined && d.t - last < this.cfg.repeatMs;
  }
}

const STRING_WORDS = ["high e", "B", "G", "D", "A", "low E"];

/** One-line hint phrasing per code, composed from the diagnosis evidence. */
export function phrase(d: Diagnosis): string {
  const { audio, vision } = d.evidence;
  switch (d.code) {
    case "missing_note": {
      // "shape close; let the high e ring" — string name is the leading token
      // of the engine's audio evidence for a string-level miss.
      const sn = STRING_WORDS.find((n) => audio?.startsWith(n));
      if (vision && sn) return `Shape close — let the ${sn} ring`;
      return audio ? `Missing a note — ${audio}` : "A target note isn't sounding";
    }
    case "muted_string":
      return audio ? `A string is muted — ${audio}` : "A string is muted";
    case "behind_fret":
      return vision ?? "A finger is too far behind its fret — slide it up";
    case "wrong_fret":
    case "wrong_string":
      return vision ?? "A finger looks off its target";
    case "late_strum":
      return `Prepare the ${d.target.chord} shape earlier — ${audio ?? "the change came late"}`;
    case "ok":
      return vision ?? "Sounding good";
  }
}
