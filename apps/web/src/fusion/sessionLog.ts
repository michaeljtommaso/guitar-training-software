// Structured session event log → IndexedDB via Dexie (ADR-010). Zod is the
// WRITE GATE (§11 house rule): an invalid record never reaches the store.
// Ring-capped both per-record (diagnoses/hints arrays) and across records
// (oldest sessions evicted) so the log never grows unbounded.
import Dexie, { type EntityTable } from "dexie";
import { z } from "zod";
import { DiagnosisSchema } from "./diagnosis";

export const MAX_SESSIONS = 50;
export const MAX_DIAGNOSES_PER_SESSION = 300;
export const MAX_HINTS_PER_SESSION = 100;

const HintRecordSchema = z.object({
  t: z.number(),
  code: z.string(),
  text: z.string(),
  hedged: z.boolean(),
  conf: z.number().min(0).max(1),
  severity: z.number().min(0).max(1),
});

export const SessionRecordSchema = z.object({
  id: z.number().int().optional(), // Dexie auto-increment
  startedAt: z.number(), // epoch ms
  endedAt: z.number().optional(),
  lessonId: z.string().min(1),
  steps: z.array(z.object({ step: z.number().int().min(0), chord: z.string(), t: z.number() })),
  diagnoses: z.array(DiagnosisSchema).max(MAX_DIAGNOSES_PER_SESSION),
  hints: z.array(HintRecordSchema).max(MAX_HINTS_PER_SESSION),
  stats: z.object({
    diagnoses: z.number().int().min(0),
    byCode: z.record(z.string(), z.number().int().min(0)),
    hints: z.number().int().min(0),
    droppedEvents: z.number().int().min(0),
    evaluations: z.number().int().min(0),
    // Additive (WP-7): "Tip was wrong" complaints → §16 false-feedback metric.
    // Defaulted so older records without the field still validate.
    complaints: z.number().int().min(0).default(0),
  }),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export type SessionDB = Dexie & { sessions: EntityTable<SessionRecord, "id"> };

export function createSessionDB(name = "guitar-tutor"): SessionDB {
  const db = new Dexie(name) as SessionDB;
  db.version(1).stores({ sessions: "++id, startedAt" });
  return db;
}

// Lazy singleton — nothing touches indexedDB at import time (jsdom-safe).
let defaultDB: SessionDB | null = null;
export function sessionDB(): SessionDB {
  return (defaultDB ??= createSessionDB());
}

/** Trim the unbounded arrays to their ring caps (keep the newest entries). */
export function capSession(rec: SessionRecord): SessionRecord {
  return {
    ...rec,
    diagnoses: rec.diagnoses.slice(-MAX_DIAGNOSES_PER_SESSION),
    hints: rec.hints.slice(-MAX_HINTS_PER_SESSION),
  };
}

/**
 * Zod-gated write: parse (throws on malformed — the gate), upsert, then evict
 * the oldest sessions beyond MAX_SESSIONS. Returns the record id.
 */
export async function saveSession(db: SessionDB, rec: SessionRecord): Promise<number> {
  const valid = SessionRecordSchema.parse(capSession(rec));
  const id = (await db.sessions.put(valid)) as number;
  const count = await db.sessions.count();
  if (count > MAX_SESSIONS) {
    const excess = await db.sessions.orderBy("startedAt").limit(count - MAX_SESSIONS).primaryKeys();
    await db.sessions.bulkDelete(excess);
  }
  return id;
}
