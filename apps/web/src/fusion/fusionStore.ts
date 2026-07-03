// Fusion runtime wiring (module store, ADR-002 pattern): perception events
// flow in from the capture controller on the main thread, through the PURE
// FusionEngine + FeedbackPolicy, out to (a) hot overlay state (never through
// React), (b) a coarse React snapshot, and (c) the Dexie session log.
// All timers/wall-clock live HERE — the engine and policy stay deterministic.
import { FusionEngine } from "./engine";
import { FeedbackPolicy, type Hint } from "./feedbackPolicy";
import { getLesson } from "./lessons";
import {
  MAX_DIAGNOSES_PER_SESSION,
  MAX_HINTS_PER_SESSION,
  saveSession,
  sessionDB,
  SessionRecordSchema,
  type SessionRecord,
} from "./sessionLog";
import type { Diagnosis } from "./diagnosis";
import type { StatusKey } from "../theme/statusColors";

const FLUSH_MS = 2000;
const LATENCY_SAMPLES_MAX = 200;

/** Hot state read by the overlay inside its frame callback — never React. */
export const fusionHot: {
  active: boolean;
  stringStatus: Record<number, StatusKey> | null;
  hintText: string;
} = { active: false, stringStatus: null, hintText: "" };

export interface FusionSnapshot {
  lessonId: string | null;
  lessonTitle: string | null;
  stepIndex: number;
  stepCount: number;
  targetChord: string | null;
  hint: Hint | null;
  lastDiagnosis: Diagnosis | null;
  stringStatus: Record<number, StatusKey> | null;
  counts: { diagnoses: number; hints: number; dropped: number; evaluations: number };
  /** ingest-batch → hint-emit latency (ms, main-thread) for batches that produced a hint. */
  hintLatencyMs: number[];
  /** ingest-batch → evaluation-complete latency (ms, main-thread), all batches. */
  evalLatencyMs: number[];
}

const emptySnapshot = (): FusionSnapshot => ({
  lessonId: null,
  lessonTitle: null,
  stepIndex: 0,
  stepCount: 0,
  targetChord: null,
  hint: null,
  lastDiagnosis: null,
  stringStatus: null,
  counts: { diagnoses: 0, hints: 0, dropped: 0, evaluations: 0 },
  hintLatencyMs: [],
  evalLatencyMs: [],
});

let snapshot: FusionSnapshot = emptySnapshot();
const listeners = new Set<() => void>();

export function getFusionSnapshot(): FusionSnapshot {
  return snapshot;
}
export function subscribeFusion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify(patch: Partial<FusionSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

// ── runtime ──────────────────────────────────────────────────────────────────

let engine: FusionEngine | null = null;
let policy: FeedbackPolicy | null = null;
let record: SessionRecord | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let dirty = false;
let lastEventT = 0;
const hintLatencyMs: number[] = [];
const evalLatencyMs: number[] = [];

export function startLesson(lessonId: string): boolean {
  const lesson = getLesson(lessonId);
  if (!lesson) return false;
  stopLesson();
  engine = new FusionEngine(lesson);
  policy = new FeedbackPolicy();
  policy.setPriority(lesson.steps[0].feedback_priority);
  record = {
    startedAt: Date.now(),
    lessonId: lesson.id,
    steps: [{ step: 0, chord: lesson.steps[0].chord, t: 0 }],
    diagnoses: [],
    hints: [],
    stats: { diagnoses: 0, byCode: {}, hints: 0, droppedEvents: 0, evaluations: 0 },
  };
  hintLatencyMs.length = 0;
  evalLatencyMs.length = 0;
  fusionHot.active = true;
  fusionHot.stringStatus = engine.stringStatus;
  fusionHot.hintText = "";
  flushTimer = setInterval(() => void flush(), FLUSH_MS);
  notify({
    ...emptySnapshot(),
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    stepIndex: 0,
    stepCount: lesson.steps.length,
    targetChord: lesson.steps[0].chord,
    stringStatus: engine.stringStatus,
  });
  return true;
}

export function stopLesson(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (record) {
    record.endedAt = Date.now();
    dirty = true;
    void flush();
  }
  engine = null;
  policy = null;
  record = null;
  fusionHot.active = false;
  fusionHot.stringStatus = null;
  fusionHot.hintText = "";
  notify(emptySnapshot());
}

/** Advance to a lesson step (UI-driven; time = latest event time seen). */
export function setStep(stepIndex: number): void {
  if (!engine || !policy || !record) return;
  const lesson = engine.lesson;
  const idx = Math.max(0, Math.min(lesson.steps.length - 1, stepIndex));
  engine.beginStep(idx, lastEventT);
  policy.setPriority(lesson.steps[idx].feedback_priority);
  record.steps.push({ step: idx, chord: lesson.steps[idx].chord, t: lastEventT });
  dirty = true;
  notify({ stepIndex: idx, targetChord: lesson.steps[idx].chord, hint: null });
}

// CLOCK BRIDGING (WP-4). The engine assumes ONE clock (audio-clock ms). The two
// perception legs are stamped on THREE different origins:
//   • audio events → audio clock (AudioContext currentTime, origin = ctx start)
//   • vision events → the vision WORKER's performance.now() (origin = worker
//     spawn ≈ capture start) — a different origin, meaningless in the audio domain
//   • main thread performance.now() → origin = page load (navigationStart)
// The one clock EVERY agent shares directly is Date.now() (wall). We bridge
// through it, exactly like the WP-1 ring buffer solved glass-to-worker latency:
//   • the audio leg carries a (audioMs, wallMs) pair sampled TOGETHER in the
//     worklet (ringBuffer dual stamps) → offset = wallMs − audioMs
//   • the vision worker stamps each frame batch with Date.now() at detection
//     completion → audioT = batchWallMs − offset
// Every conversion is between clocks actually sampled together somewhere; there
// is NO third-origin arithmetic (the old code derived the offset from the main
// thread's performance.now() and applied it to WORKER-origin timestamps, adding
// a constant page-load→capture bias of seconds — vision then aged past
// assignsTtlMs and fusion silently collapsed to audio-only).
// Residual bias is bounded to ~tens of ms: the vision wall stamp is taken at
// detection completion (not frame capture), so it lags the frame content by the
// detect+transport latency; audio↔wall drift between anchor refreshes is ppm.
// Re-anchored on every audio batch — the calibration knob for real-clock drift.
let wallToAudioOffset: number | null = null; // wallMs − audioMs (one instant)

/** Clock stamps carried alongside a worker→fusion batch (see CLOCK BRIDGING). */
export interface IngestClock {
  /** Date.now() wall-clock stamp for this batch (the shared clock). */
  wallMs: number;
  /** Audio-clock stamp sampled TOGETHER with wallMs — audio leg only. */
  audioMs?: number;
}

/**
 * Ingest a batch of raw perception events (worker → fusion boundary; the
 * engine Zod-validates each and drops+counts malformed ones). Called from the
 * capture controller for every audioEvents / visionFrame message. `clock`
 * carries the batch's wall stamp (+ audio anchor for the audio leg) so vision
 * timestamps can be rebased onto the audio clock (see CLOCK BRIDGING above).
 */
export function fusionIngest(events: unknown[], leg: "audio" | "vision", clock?: IngestClock): void {
  if (!engine || !policy || !record) return;
  // Refresh the wall↔audio anchor from the audio leg's together-sampled pair.
  if (leg === "audio" && clock && typeof clock.audioMs === "number") {
    wallToAudioOffset = clock.wallMs - clock.audioMs;
  }
  // Rebase the whole vision batch onto the audio clock via the shared wall
  // stamp. Before the first audio anchor lands we can't place vision on the
  // timeline — skip it (audio flows from capture start, so this only ever skips
  // the earliest pre-calibration frames).
  let visionAudioT: number | null = null;
  if (leg === "vision") {
    if (wallToAudioOffset === null || !clock) return;
    visionAudioT = clock.wallMs - wallToAudioOffset;
  }
  const t0 = performance.now();
  let hint: Hint | null = null;
  let last: Diagnosis | null = null;
  for (let raw of events) {
    if (leg === "vision") raw = { ...(raw as object), t: visionAudioT };
    const diagnoses = engine.ingest(raw, leg);
    const et = (raw as { t?: number }).t;
    if (typeof et === "number" && Number.isFinite(et)) lastEventT = Math.max(lastEventT, et);
    for (const d of diagnoses) {
      last = d;
      record.diagnoses.push(d);
      record.stats.diagnoses++;
      record.stats.byCode[d.code] = (record.stats.byCode[d.code] ?? 0) + 1;
      const h = policy.push(d);
      if (h) {
        hint = h;
        record.hints.push(h);
        record.stats.hints++;
      }
    }
  }
  const dt = performance.now() - t0;
  pushCapped(evalLatencyMs, dt);
  if (hint) pushCapped(hintLatencyMs, dt);
  record.stats.droppedEvents = engine.stats.dropped;
  record.stats.evaluations = engine.stats.evaluations;
  // In-memory ring caps mirror the write-gate caps (sessionLog).
  if (record.diagnoses.length > MAX_DIAGNOSES_PER_SESSION)
    record.diagnoses.splice(0, record.diagnoses.length - MAX_DIAGNOSES_PER_SESSION);
  if (record.hints.length > MAX_HINTS_PER_SESSION)
    record.hints.splice(0, record.hints.length - MAX_HINTS_PER_SESSION);

  if (last || hint) {
    dirty = true;
    fusionHot.stringStatus = engine.stringStatus;
    if (hint) fusionHot.hintText = hint.text;
    notify({
      hint: hint ?? snapshot.hint,
      lastDiagnosis: last ?? snapshot.lastDiagnosis,
      stringStatus: engine.stringStatus,
      counts: {
        diagnoses: engine.stats.diagnoses,
        hints: record.stats.hints,
        dropped: engine.stats.dropped,
        evaluations: engine.stats.evaluations,
      },
      hintLatencyMs: [...hintLatencyMs],
      evalLatencyMs: [...evalLatencyMs],
    });
  }
}

async function flush(): Promise<void> {
  if (!dirty || !record) return;
  dirty = false;
  try {
    const id = await saveSession(sessionDB(), record);
    record.id = id; // subsequent flushes update the same row
  } catch (err) {
    console.error("[fusion] session-log write rejected:", err);
  }
}

function pushCapped(arr: number[], v: number): void {
  arr.push(v);
  if (arr.length > LATENCY_SAMPLES_MAX) arr.shift();
}

// ── e2e/debug hook ───────────────────────────────────────────────────────────
declare global {
  interface Window {
    __fusionDebug?: {
      snapshot(): FusionSnapshot;
      hot: typeof fusionHot;
      /** Audio-clock timestamps of every hint this session (rate-limit proof). */
      hintTimes(): number[];
      /** Reads sessions back from IndexedDB and Zod-validates every record. */
      validateStoredSessions(): Promise<{ count: number; allValid: boolean }>;
      /** True once the audio leg has established the wall↔audio clock anchor. */
      clockReady(): boolean;
      /** Diagnoses this session whose evidence cites BOTH legs (cross-leg proof). */
      crossLegDiagnoses(): Diagnosis[];
      /**
       * e2e ONLY — inject a SYNTHETIC (honestly-labeled) calib + fingerAssign
       * batch through the REAL vision ingest path (fusionIngest, not a bypass
       * into the engine). The event `t` is a skewed worker-style performance.now()
       * so the fixed clock bridging is exercised: it must be IGNORED and the real
       * Date.now() wall stamp used instead. Returns the audio-clock time the batch
       * normalized to (or null if the clock anchor isn't ready yet).
       */
      injectSyntheticVision(): number | null;
    };
  }
}
if (typeof window !== "undefined") {
  window.__fusionDebug = {
    snapshot: getFusionSnapshot,
    hot: fusionHot,
    hintTimes: () => record?.hints.map((h) => h.t) ?? [],
    async validateStoredSessions() {
      const recs = await sessionDB().sessions.toArray();
      return {
        count: recs.length,
        allValid: recs.every((r) => SessionRecordSchema.safeParse(r).success),
      };
    },
    clockReady: () => wallToAudioOffset !== null,
    crossLegDiagnoses: () =>
      (record?.diagnoses ?? []).filter((d) => d.evidence.audio && d.evidence.vision),
    injectSyntheticVision() {
      if (wallToAudioOffset === null) return null;
      // Skewed worker-origin stamp (~+9 s vs the audio clock): the fix MUST
      // ignore this and use the real Date.now() wall stamp below.
      const skewedWorkerT = performance.now() + 9000;
      const wallMs = Date.now();
      const events = [
        { t: skewedWorkerT, kind: "calib", homographyConf: 0.9 },
        {
          t: skewedWorkerT,
          kind: "fingerAssign",
          // Canonical open-C shape — SYNTHETIC, no accuracy claim.
          assigns: [
            { finger: "index", string: 2, fret: 1, conf: 0.9 },
            { finger: "middle", string: 4, fret: 2, conf: 0.9 },
            { finger: "ring", string: 5, fret: 3, conf: 0.9 },
          ],
        },
      ];
      fusionIngest(events, "vision", { wallMs });
      return wallMs - wallToAudioOffset;
    },
  };
}
