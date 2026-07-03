// WP-4 fusion engine (ADR-007): a deterministic TypeScript state machine that
// consumes §9.1 audio+vision events and emits §9.1 Diagnoses via
// CONFIDENCE-WEIGHTED combination — never a hard AND.
//
// PURITY CONTRACT: no timers, no wall-clock reads, no randomness. Time enters
// exclusively on events (audio-clock ms) and beginStep(t). The same event
// sequence in always yields the same diagnosis sequence out (proven in
// engine.test.ts, including a source scan for banned tokens).
//
// FALSE-POSITIVE-AVERSE: single-leg evidence is confidence-capped, octave-
// ambiguous audio absence is down-weighted, and a fully-correct-sounding
// chord is NEVER corrected on vision alone (§9.2 valid-alternate case).
import {
  AudioEventSchema,
  VisionEventSchema,
  type Diagnosis,
  type LessonStepRef,
} from "./diagnosis";
import type { AudioEvent } from "./events/audioEvents";
import type { VisionEvent, FingerAssign } from "./events/visionEvents";
import { validateStrings } from "../perception/audio/stringValidation";
import { midiToPitchClass } from "../perception/audio/dsp/pitch";
import {
  expectedNotes,
  openMidi,
  type Fingering,
  type Lesson,
  type LessonStep,
} from "./lessons";
import type { StatusKey } from "../theme/statusColors";

export interface EngineConfig {
  /** Minimum event-time gap between evaluations (ms). */
  minEvalGapMs: number;
  /** Chord/hand arriving later than this after a step change → late_strum. */
  lateStrumMs: number;
  /** Later than this → they paused, not a late strum; transition dropped. */
  lateGiveUpMs: number;
  /** After the new chord is heard, wait this long for the vision leg before
   *  resolving the transition (so late_strum can cite both legs). */
  transitionGraceMs: number;
  /** Notes evidence older than this (ms) is stale. */
  notesTtlMs: number;
  /** Vision assigns older than this (ms) are stale. */
  assignsTtlMs: number;
  /** Shape score at/above this counts as "shape close" (§9.2 case a). */
  shapeMatchMin: number;
  /** Vision leg unusable below this fused vision confidence. */
  visionConfMin: number;
  /** EMA weight of the newest chord event in the smoothed posterior. */
  chordAlpha: number;
  /** Fused confidence cap when only ONE leg carries evidence. */
  singleLegCap: number;
  /** behindFretDist above this (with the string not ringing) → behind_fret. */
  behindFretMax: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  minEvalGapMs: 250,
  lateStrumMs: 150,
  lateGiveUpMs: 2000,
  transitionGraceMs: 300,
  notesTtlMs: 4000,
  assignsTtlMs: 2000,
  shapeMatchMin: 0.5,
  visionConfMin: 0.3,
  chordAlpha: 0.7,
  singleLegCap: 0.75,
  behindFretMax: 0.45,
};

export interface EngineStats {
  /** Malformed events dropped at the Zod ingest boundary (never crash). */
  dropped: number;
  evaluations: number;
  diagnoses: number;
}

const STRING_NAMES = ["high e", "B", "G", "D", "A", "low E"] as const;
export function stringName(s: number): string {
  return STRING_NAMES[s - 1] ?? `string ${s}`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface PendingTransition {
  t: number; // step-change time
  audioT: number | null; // when the new target chord was first heard
  visionT: number | null; // when the hand shape first matched the new target
}

export class FusionEngine {
  readonly cfg: EngineConfig;
  readonly stats: EngineStats = { dropped: 0, evaluations: 0, diagnoses: 0 };

  private stepIndex = 0;
  private chordBelief: Record<string, number> = {};
  private lastChordLabel: string | null = null;
  private lastNotes: { t: number; pitches: number[]; conf: number } | null = null;
  private assigns: FingerAssign[] = [];
  private assignsT = -Infinity;
  private calibConf = 0;
  private onsets: number[] = [];
  private pending: PendingTransition | null = null;
  private lastEvalT = -Infinity;
  private status: Record<number, StatusKey> = uncertainStatus();

  constructor(
    readonly lesson: Lesson,
    cfg: Partial<EngineConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_ENGINE_CONFIG, ...cfg };
  }

  get step(): LessonStep {
    return this.lesson.steps[this.stepIndex];
  }

  get currentStepIndex(): number {
    return this.stepIndex;
  }

  /** Smoothed posterior for the current target chord (0..1). */
  get targetChordP(): number {
    return this.chordBelief[this.step.chord] ?? 0;
  }

  /** Per-string R/Y/G/uncertain status from the last evaluation. */
  get stringStatus(): Record<number, StatusKey> {
    return this.status;
  }

  /** Advance/set the lesson step at event time `t` and arm late-strum tracking. */
  beginStep(stepIndex: number, t: number): void {
    const next = Math.max(0, Math.min(this.lesson.steps.length - 1, stepIndex));
    if (next === this.stepIndex) return;
    this.stepIndex = next;
    this.pending = { t, audioT: null, visionT: null };
    this.status = uncertainStatus();
  }

  /**
   * Ingest one raw event from a perception worker. Zod is the boundary:
   * malformed events are dropped and counted, never thrown. Returns the
   * diagnoses produced by this ingestion (0 or 1 — evaluation is cadenced).
   */
  ingest(raw: unknown, leg: "audio" | "vision"): Diagnosis[] {
    const parsed = leg === "audio" ? AudioEventSchema.safeParse(raw) : VisionEventSchema.safeParse(raw);
    if (!parsed.success) {
      this.stats.dropped++;
      return [];
    }
    const ev = parsed.data;
    if (leg === "audio") this.applyAudio(ev as AudioEvent);
    else this.applyVision(ev as VisionEvent);

    if (ev.t - this.lastEvalT >= this.cfg.minEvalGapMs) {
      this.lastEvalT = ev.t;
      const out = this.evaluate(ev.t);
      this.stats.evaluations++;
      this.stats.diagnoses += out.length;
      return out;
    }
    return [];
  }

  // ── state updates ─────────────────────────────────────────────────────────

  private applyAudio(ev: AudioEvent): void {
    switch (ev.kind) {
      case "onset":
        this.onsets.push(ev.t);
        if (this.onsets.length > 8) this.onsets.shift();
        break;
      case "chord": {
        const a = this.cfg.chordAlpha;
        for (const k of Object.keys(this.chordBelief)) this.chordBelief[k] *= 1 - a;
        this.chordBelief[ev.label] = (this.chordBelief[ev.label] ?? 0) + a * ev.conf;
        this.lastChordLabel = ev.label;
        if (this.pending && this.pending.audioT === null && ev.label === this.step.chord) {
          this.pending.audioT = ev.t;
        }
        break;
      }
      case "notes":
        this.lastNotes = { t: ev.t, pitches: ev.pitches, conf: ev.conf };
        break;
      case "tuning":
        break; // cadence driver only — tuner reading has no chord-level use here
    }
  }

  private applyVision(ev: VisionEvent): void {
    switch (ev.kind) {
      case "fingerAssign": {
        this.assigns = ev.assigns;
        this.assignsT = ev.t;
        if (this.pending && this.pending.visionT === null) {
          const { best } = this.bestShape(ev.assigns);
          if (best >= this.cfg.shapeMatchMin) this.pending.visionT = ev.t;
        }
        break;
      }
      case "calib":
        this.calibConf = ev.homographyConf;
        break;
      case "hand":
      case "strum":
        break; // not needed for the current diagnosis set
    }
  }

  // ── fusion evaluation (pure function of state + t) ────────────────────────

  private evaluate(t: number): Diagnosis[] {
    const cfg = this.cfg;
    const step = this.step;
    const target: LessonStepRef = { lessonId: this.lesson.id, step: this.stepIndex, chord: step.chord };

    // 1) Transition tracking (§9.2 case c — late strum).
    if (this.pending) {
      const p = this.pending;
      if (p.audioT === null) {
        if (t - p.t <= cfg.lateGiveUpMs) return []; // in flight — don't correct a moving hand
        this.pending = null; // stalled, not late — resume normal diagnosis
      } else if (p.visionT === null && t - p.audioT < cfg.transitionGraceMs && t - p.t <= cfg.lateGiveUpMs) {
        return []; // chord heard; brief grace for the vision leg to land
      } else {
        this.pending = null;
        const da = p.audioT - p.t;
        const dv = p.visionT !== null ? p.visionT - p.t : null;
        if (da > cfg.lateStrumMs && da <= cfg.lateGiveUpMs) {
          const visionLate = dv !== null && dv > cfg.lateStrumMs;
          return [this.emitStatus({
            t,
            code: "late_strum",
            target,
            evidence: {
              audio: `chord ${step.chord} arrived ${Math.round(da)} ms after the step change`,
              vision:
                dv === null
                  ? undefined
                  : visionLate
                    ? `hand shape settled ${Math.round(dv)} ms late — prepare the shape earlier`
                    : `hand shape was ready ${Math.round(dv)} ms after the change`,
            },
            severity: clamp01(da / 600),
            conf: this.fuse(clamp01(0.5 + 0.5 * this.targetChordP), dv === null ? undefined : visionLate ? 0.8 : 0.4),
          })];
        }
        // On time (or gave up long ago) — fall through to a normal evaluation.
      }
    }

    // 2) Audio evidence.
    const notesFresh = this.lastNotes !== null && t - this.lastNotes.t <= cfg.notesTtlMs;
    const expected = expectedNotes(step);
    let exactMissing: number[] = [];
    let pcMissing: number[] = [];
    let mutedCandidates: number[] = [];
    let extraMidi: number[] = [];
    if (notesFresh && this.lastNotes) {
      const detected = this.lastNotes.pitches.map(Math.round);
      const detSet = new Set(detected);
      exactMissing = expected.filter((e) => !detSet.has(e.midi)).map((e) => e.string).sort((a, b) => a - b);
      const v = validateStrings(expected, detected);
      pcMissing = [...v.missing].sort((a, b) => a - b);
      mutedCandidates = v.possiblyMuted;
      extraMidi = v.extra;
    }
    const chordP = this.targetChordP;

    // 3) Vision evidence.
    const visionFresh = this.assigns.length > 0 && t - this.assignsT <= cfg.assignsTtlMs;
    const meanAssignConf = visionFresh
      ? this.assigns.reduce((s, a) => s + a.conf, 0) / this.assigns.length
      : 0;
    const visionConf = visionFresh ? this.calibConf * meanAssignConf : 0;
    const { best: bestScore, fingering: bestFingering, canonical: canonicalScore } = this.bestShape(this.assigns);
    const visionUsable = visionFresh && visionConf >= cfg.visionConfMin;
    const visionEvidenceConf = clamp01(bestScore * this.calibConf);

    this.status = this.computeStringStatus(step, notesFresh, exactMissing, pcMissing, extraMidi);

    // Nothing to judge: silence and no fresh evidence on either leg.
    if (!notesFresh && !visionUsable && (this.lastChordLabel === null || this.lastChordLabel === "silence")) {
      return [];
    }

    const audioCorrect =
      notesFresh && exactMissing.length === 0 && chordP >= step.success_criteria.min_audio_conf;

    // 4a) Audio fully correct → NEVER a correction (§9.2 case b). Vision that
    // disagrees with the canonical shape is a valid alternate fingering — at
    // most a low-severity nudge flag on an `ok` diagnosis.
    if (audioCorrect) {
      const alternate = visionUsable && bestScore < cfg.shapeMatchMin;
      return [this.emitStatus({
        t,
        code: "ok",
        target,
        evidence: {
          audio: `all target notes sounding (chord ${step.chord} at ${pct(chordP)})`,
          vision: alternate
            ? `fingering differs from the canonical ${step.chord} shape — accepted as a valid alternate`
            : visionUsable
              ? `shape matches ${step.chord} (${pct(bestScore)})`
              : undefined,
        },
        severity: alternate ? 0.1 : 0,
        conf: this.fuse(chordP, visionUsable ? visionEvidenceConf : undefined),
      })];
    }

    // 4b) Notes evidence shows missing strings.
    if (notesFresh && this.lastNotes && (pcMissing.length > 0 || exactMissing.length > 0)) {
      const s = pcMissing[0] ?? exactMissing[0];
      const octaveAmbiguous = !pcMissing.includes(s);
      const audioMissConf = this.lastNotes.conf * (octaveAmbiguous ? 0.55 : 0.9);
      const missAudio = `${stringName(s)} (string ${s}) not heard${octaveAmbiguous ? " — its pitch class rings elsewhere, so the octave is ambiguous" : ""}`;

      if (visionUsable && bestScore >= cfg.shapeMatchMin) {
        // §9.2 case a: shape close, a note absent → audio-led, vision-corroborated.
        const conf = this.fuse(audioMissConf, visionEvidenceConf);
        const shapeVision = `shape matches ${step.chord} (${pct(bestScore)})`;

        const placed = this.assigns.find(
          (a) => a.string === s && a.fret > 0 && a.behindFretDist !== undefined && a.behindFretDist > cfg.behindFretMax,
        );
        if (placed) {
          return [this.emitStatus({
            t, code: "behind_fret", target,
            evidence: {
              audio: missAudio,
              vision: `${placed.finger} sits far behind fret ${placed.fret} on ${stringName(s)} — move it up against the fret`,
            },
            severity: 0.5, conf,
          })];
        }
        const muterNearby = this.assigns.some(
          (a) => Math.abs(a.string - s) === 1 && a.fret > 0 && a.conf >= 0.4,
        );
        if (mutedCandidates.includes(s) && muterNearby) {
          return [this.emitStatus({
            t, code: "muted_string", target,
            evidence: { audio: missAudio, vision: `${shapeVision}; a neighbouring finger may be touching ${stringName(s)}` },
            severity: 0.6, conf,
          })];
        }
        return [this.emitStatus({
          t, code: "missing_note", target,
          evidence: { audio: missAudio, vision: shapeVision },
          severity: 0.5, conf,
        })];
      }

      if (visionUsable && bestScore < cfg.shapeMatchMin) {
        // Vision confidently disagrees with every accepted fingering AND the
        // audio is off → a placement diagnosis on the worst-mismatched finger.
        const mismatch = this.worstMismatch(bestFingering);
        if (mismatch) return [this.emitStatus({ ...mismatch, t, target })];
        // Fingers not tracked well enough to name one — audio-only fallback.
      }

      // Single-leg (audio-only) — confidence capped, policy will hedge.
      return [this.emitStatus({
        t, code: "missing_note", target,
        evidence: { audio: missAudio },
        severity: 0.5, conf: this.fuse(audioMissConf, undefined),
      })];
    }

    // 4c) No usable note set: judge on the smoothed chord posterior alone.
    if (
      chordP < step.success_criteria.min_audio_conf &&
      this.lastChordLabel !== null &&
      this.lastChordLabel !== step.chord &&
      this.lastChordLabel !== "silence"
    ) {
      const audioConf = clamp01((1 - chordP) * 0.5);
      return [this.emitStatus({
        t, code: "missing_note", target,
        evidence: {
          audio: `target chord ${step.chord} not heard (hearing: ${this.lastChordLabel})`,
          vision: visionUsable ? `shape score vs ${step.chord}: ${pct(bestScore)}` : undefined,
        },
        severity: 0.4,
        conf: this.fuse(audioConf, visionUsable ? visionEvidenceConf : undefined),
      })];
    }

    // Sounding right (or no counter-evidence): ok.
    return [this.emitStatus({
      t, code: "ok", target,
      evidence: {
        audio: this.lastChordLabel ? `hearing ${this.lastChordLabel} (target ${pct(chordP)})` : undefined,
        vision: visionUsable ? `shape score ${pct(canonicalScore)}` : undefined,
      },
      severity: 0,
      conf: this.fuse(chordP > 0 ? chordP : undefined, visionUsable ? visionEvidenceConf : undefined),
    })];
  }

  // ── helpers (all pure) ─────────────────────────────────────────────────────

  /** Confidence-weighted combination (§9.2): two legs → weighted sum; a single
   *  leg is capped (false-positive-averse); no legs → 0. */
  private fuse(audio?: number, vision?: number): number {
    if (audio !== undefined && vision !== undefined) return clamp01(0.6 * audio + 0.4 * vision);
    const single = audio ?? vision;
    return single === undefined ? 0 : clamp01(single * this.cfg.singleLegCap);
  }

  /** Score assigns against a fingering: exact cell → assign conf; right string
   *  wrong fret → 0.3·conf; else 0. Mean over the fingering's fingers. */
  private shapeScore(fingering: Fingering, assigns: FingerAssign[]): number {
    const entries = Object.entries(fingering).filter(([, p]) => p !== undefined);
    if (entries.length === 0) return 0;
    let sum = 0;
    for (const [finger, p] of entries) {
      const a = assigns.find((x) => x.finger === finger);
      if (!a || !p) continue;
      if (a.string === p.string && a.fret === p.fret) sum += a.conf;
      else if (a.string === p.string) sum += 0.3 * a.conf;
    }
    return sum / entries.length;
  }

  private bestShape(assigns: FingerAssign[]): { best: number; fingering: Fingering; canonical: number } {
    const fs = this.step.accepted_fingerings;
    let best = -1;
    let fingering = fs[0];
    for (const f of fs) {
      const score = this.shapeScore(f, assigns);
      if (score > best) {
        best = score;
        fingering = f;
      }
    }
    return { best: Math.max(0, best), fingering, canonical: this.shapeScore(fs[0], assigns) };
  }

  /** The worst-mismatched finger vs `fingering` → wrong_string / wrong_fret. */
  private worstMismatch(
    fingering: Fingering,
  ): Pick<Diagnosis, "code" | "evidence" | "severity" | "conf"> | null {
    let out: Pick<Diagnosis, "code" | "evidence" | "severity" | "conf"> | null = null;
    let worst = 0;
    for (const [finger, p] of Object.entries(fingering)) {
      if (!p) continue;
      const a = this.assigns.find((x) => x.finger === finger);
      if (!a || a.conf < 0.4) continue;
      if (a.string === p.string && a.fret === p.fret) continue;
      const legConf = clamp01(a.conf * this.calibConf);
      if (legConf <= worst) continue;
      worst = legConf;
      const wrongString = a.string !== p.string;
      out = {
        code: wrongString ? "wrong_string" : "wrong_fret",
        evidence: {
          audio: `target chord ${this.step.chord} not sounding right`,
          vision: wrongString
            ? `${finger} looks on ${stringName(a.string)} (string ${a.string}) — target is ${stringName(p.string)} (string ${p.string})`
            : `${finger} looks at fret ${a.fret} on ${stringName(p.string)} — target is fret ${p.fret}`,
        },
        severity: 0.7,
        conf: this.fuse(clamp01(1 - this.targetChordP), legConf),
      };
    }
    return out;
  }

  private computeStringStatus(
    step: LessonStep,
    notesFresh: boolean,
    exactMissing: number[],
    pcMissing: number[],
    extraMidi: number[],
  ): Record<number, StatusKey> {
    const status: Record<number, StatusKey> = {};
    const extraPcs = new Set(extraMidi.map(midiToPitchClass));
    for (let s = 1; s <= 6; s++) {
      if (step.expected_strings.includes(s)) {
        status[s] = !notesFresh
          ? "uncertain"
          : pcMissing.includes(s)
            ? "error"
            : exactMissing.includes(s)
              ? "warn"
              : "correct";
      } else if (step.avoid_strings.includes(s)) {
        status[s] = !notesFresh ? "uncertain" : extraPcs.has(midiToPitchClass(openMidi(s))) ? "error" : "correct";
      } else {
        status[s] = "uncertain";
      }
    }
    return status;
  }

  private emitStatus(d: Diagnosis): Diagnosis {
    // Round for stable, comparable output (determinism-friendly floats).
    return { ...d, severity: round3(d.severity), conf: round3(d.conf) };
  }
}

function uncertainStatus(): Record<number, StatusKey> {
  const s: Record<number, StatusKey> = {};
  for (let i = 1; i <= 6; i++) s[i] = "uncertain";
  return s;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
