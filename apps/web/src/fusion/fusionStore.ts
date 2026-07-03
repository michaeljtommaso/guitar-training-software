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

// CLOCK NORMALIZATION: audio events are stamped on the audio clock, vision
// events on the worker's performance.now(). The engine assumes ONE clock, so
// vision timestamps are mapped into the audio domain here using the arrival
// skew of the latest audio batch. Approximate (transport jitter ~tens of ms)
// but plenty for the engine's freshness windows; the engine stays pure.
let visionToAudioOffset: number | null = null; // performance.now() − audio t

/**
 * Ingest a batch of raw perception events (worker → fusion boundary; the
 * engine Zod-validates each and drops+counts malformed ones). Called from the
 * capture controller for every audioEvents / visionFrame message.
 */
export function fusionIngest(events: unknown[], leg: "audio" | "vision"): void {
  if (!engine || !policy || !record) return;
  const t0 = performance.now();
  let hint: Hint | null = null;
  let last: Diagnosis | null = null;
  for (let raw of events) {
    const rawT = (raw as { t?: number }).t;
    if (leg === "audio" && typeof rawT === "number" && Number.isFinite(rawT)) {
      visionToAudioOffset = performance.now() - rawT;
    } else if (leg === "vision" && typeof rawT === "number" && Number.isFinite(rawT)) {
      raw = { ...(raw as object), t: visionToAudioOffset === null ? 0 : rawT - visionToAudioOffset };
    }
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
  };
}
