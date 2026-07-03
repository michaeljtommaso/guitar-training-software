// Session log unit tests against fake-indexeddb: Zod write gate (invalid
// records never land), ring caps (per-record arrays + max sessions), and a
// round-trip that re-validates what was stored. Real IndexedDB is proven in
// the fusion e2e spec.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createSessionDB,
  saveSession,
  SessionRecordSchema,
  MAX_SESSIONS,
  MAX_DIAGNOSES_PER_SESSION,
  type SessionRecord,
} from "./sessionLog";
import type { Diagnosis } from "./diagnosis";

let dbSeq = 0;
const freshDB = () => createSessionDB(`test-sessions-${++dbSeq}`);

const diag = (t: number): Diagnosis => ({
  t,
  code: "missing_note",
  target: { lessonId: "open_chords_c_major", step: 0, chord: "C" },
  evidence: { audio: "high e (string 1) not heard" },
  severity: 0.5,
  conf: 0.6,
});

const record = (startedAt = 1000): SessionRecord => ({
  startedAt,
  lessonId: "open_chords_c_major",
  steps: [{ step: 0, chord: "C", t: 0 }],
  diagnoses: [diag(100), diag(400)],
  hints: [{ t: 400, code: "missing_note", text: "Shape close — let the high e ring", hedged: false, conf: 0.6, severity: 0.5 }],
  stats: { diagnoses: 2, byCode: { missing_note: 2 }, hints: 1, droppedEvents: 0, evaluations: 5 },
});

describe("sessionLog — Zod as the write gate (§11)", () => {
  it("round-trips a valid record; the stored shape re-validates", async () => {
    const db = freshDB();
    const id = await saveSession(db, record());
    const stored = await db.sessions.get(id);
    expect(stored).toBeDefined();
    expect(SessionRecordSchema.safeParse(stored).success).toBe(true);
    expect(stored!.hints[0].text).toContain("high e");
  });

  it("rejects a malformed record — nothing reaches the store", async () => {
    const db = freshDB();
    const bad = record() as unknown as Record<string, unknown>;
    (bad.diagnoses as Record<string, unknown>[])[0].severity = 7; // out of range
    await expect(saveSession(db, bad as unknown as SessionRecord)).rejects.toThrow();
    const missingLesson = { ...record(), lessonId: "" };
    await expect(saveSession(db, missingLesson)).rejects.toThrow();
    expect(await db.sessions.count()).toBe(0);
  });

  it("ring-caps per-record arrays (keeps the newest diagnoses)", async () => {
    const db = freshDB();
    const rec = record();
    rec.diagnoses = Array.from({ length: MAX_DIAGNOSES_PER_SESSION + 100 }, (_, i) => diag(i));
    const id = await saveSession(db, rec);
    const stored = (await db.sessions.get(id))!;
    expect(stored.diagnoses).toHaveLength(MAX_DIAGNOSES_PER_SESSION);
    expect(stored.diagnoses[0].t).toBe(100); // oldest 100 trimmed
  });

  it("evicts the oldest sessions beyond MAX_SESSIONS (never grows unbounded)", async () => {
    const db = freshDB();
    for (let i = 0; i < MAX_SESSIONS + 5; i++) {
      await saveSession(db, record(1000 + i));
    }
    expect(await db.sessions.count()).toBe(MAX_SESSIONS);
    const oldest = await db.sessions.orderBy("startedAt").first();
    expect(oldest!.startedAt).toBe(1005); // the 5 oldest evicted
  });
});
