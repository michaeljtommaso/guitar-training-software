// §9.1 Diagnosis type (exact) + Zod schemas for every fusion boundary
// (ADR-007 event schema, ADR-010/§11 house rule: Zod as the write gate).
// Malformed events must be dropped and counted at the ingest boundary — never
// crash the loop — so every schema here is used through safeParse.
import { z } from "zod";
import type { AudioEvent } from "./events/audioEvents";
import type { VisionEvent } from "./events/visionEvents";

// ── Diagnosis (§9.1, exact) ─────────────────────────────────────────────────

export const DIAGNOSIS_CODES = [
  "wrong_fret",
  "wrong_string",
  "muted_string",
  "behind_fret",
  "missing_note",
  "late_strum",
  "ok",
] as const;
export type DiagnosisCode = (typeof DIAGNOSIS_CODES)[number];

/** §9.1 references LessonStepRef without defining it — minimal definition. */
export interface LessonStepRef {
  lessonId: string;
  step: number;
  chord: string;
}

export interface Diagnosis {
  t: number;
  code: DiagnosisCode;
  target: LessonStepRef;
  evidence: { audio?: string; vision?: string };
  severity: number; // 0..1
  conf: number; // fused confidence 0..1
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

const conf01 = z.number().min(0).max(1);
const stringNum = z.number().int().min(1).max(6); // standard: 1 = high e … 6 = low E

export const AudioEventSchema = z.discriminatedUnion("kind", [
  z.object({ t: z.number(), kind: z.literal("onset"), strength: z.number(), conf: conf01 }),
  z.object({ t: z.number(), kind: z.literal("chord"), label: z.string(), conf: conf01 }),
  z.object({ t: z.number(), kind: z.literal("notes"), pitches: z.array(z.number()), conf: conf01 }),
  z.object({ t: z.number(), kind: z.literal("tuning"), string: stringNum, cents: z.number() }),
]) satisfies z.ZodType<AudioEvent>;

const landmark = z.tuple([z.number(), z.number(), z.number()]);

export const FingerAssignSchema = z.object({
  finger: z.enum(["thumb", "index", "middle", "ring", "pinky"]),
  string: stringNum,
  fret: z.number().int().min(0),
  conf: conf01,
  behindFretDist: z.number().optional(),
});

export const VisionEventSchema = z.discriminatedUnion("kind", [
  z.object({
    t: z.number(),
    kind: z.literal("hand"),
    landmarks: z.array(landmark),
    handed: z.enum(["L", "R"]),
    conf: conf01,
  }),
  z.object({ t: z.number(), kind: z.literal("fingerAssign"), assigns: z.array(FingerAssignSchema) }),
  z.object({ t: z.number(), kind: z.literal("calib"), homographyConf: conf01 }),
  z.object({ t: z.number(), kind: z.literal("strum"), dir: z.enum(["down", "up", "none"]), conf: conf01 }),
]) satisfies z.ZodType<VisionEvent>;

export const LessonStepRefSchema = z.object({
  lessonId: z.string().min(1),
  step: z.number().int().min(0),
  chord: z.string().min(1),
}) satisfies z.ZodType<LessonStepRef>;

export const DiagnosisSchema = z.object({
  t: z.number(),
  code: z.enum(DIAGNOSIS_CODES),
  target: LessonStepRefSchema,
  evidence: z.object({ audio: z.string().optional(), vision: z.string().optional() }),
  severity: conf01,
  conf: conf01,
}) satisfies z.ZodType<Diagnosis>;
