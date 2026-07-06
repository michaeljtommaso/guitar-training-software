// Lessons-as-data (§9.4, ADR-007): lessons are JSON content under
// /data/lessons, Zod-validated at the read boundary (§11 house rule). The
// engine only ever sees parsed Lesson objects — edit the data, behavior
// changes, zero engine redeploy (proven in lessons.test.ts).
//
// STRING NUMBERING: standard convention, 1 = high e … 6 = low E (authoritative
// note in ./index.ts). §9.4's example `avoid_strings:[1]` for C major is the
// known-inconsistent low-E-first form; shipped data uses [6].
import { z } from "zod";
import { STANDARD_TUNING_MIDI } from "../perception/audio/dsp/pitch";
import type { ExpectedString } from "../perception/audio/stringValidation";

const stringNum = z.number().int().min(1).max(6);

const PlacementSchema = z.object({ string: stringNum, fret: z.number().int().min(0).max(5) });

/** One accepted fingering: finger → string/fret cell (§9.4 shape). */
export const FingeringSchema = z.object({
  thumb: PlacementSchema.optional(),
  index: PlacementSchema.optional(),
  middle: PlacementSchema.optional(),
  ring: PlacementSchema.optional(),
  pinky: PlacementSchema.optional(),
});
export type Fingering = z.infer<typeof FingeringSchema>;

// feedback_priority entries are §9.1 Diagnosis codes (the §9.4 example's prose
// names — accidental_muting/missing_string — map to muted_string/missing_note).
const PRIORITY_CODES = [
  "wrong_fret",
  "wrong_string",
  "muted_string",
  "behind_fret",
  "missing_note",
  "late_strum",
] as const;

export const LessonStepSchema = z
  .object({
    chord: z.string().min(1),
    accepted_fingerings: z.array(FingeringSchema).min(1),
    expected_strings: z.array(stringNum).min(1),
    avoid_strings: z.array(stringNum),
    success_criteria: z.object({
      hold_time_ms: z.number().min(0),
      min_audio_conf: z.number().min(0).max(1),
      max_muted_strings: z.number().int().min(0),
    }),
    feedback_priority: z.array(z.enum(PRIORITY_CODES)),
  })
  .refine((s) => s.expected_strings.every((n) => !s.avoid_strings.includes(n)), {
    message: "expected_strings and avoid_strings must be disjoint",
  });
export type LessonStep = z.infer<typeof LessonStepSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(LessonStepSchema).min(1),
  tone_preset: z.string().optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;

/** Zod-validated read boundary — throws on malformed lesson data. */
export function parseLesson(raw: unknown): Lesson {
  return LessonSchema.parse(raw);
}

// Eager-load all shipped lessons at build time (bundled; no fetch, no YAML dep).
const modules = import.meta.glob("../../../../data/lessons/*.json", {
  eager: true,
  import: "default",
});
export const lessons: Lesson[] = Object.values(modules)
  .map(parseLesson)
  .sort((a, b) => a.id.localeCompare(b.id));

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

// ── Derived target data the engine consumes ────────────────────────────────

/** Open-string MIDI by standard string number (1 = high e = E4 … 6 = low E = E2). */
export function openMidi(string: number): number {
  return STANDARD_TUNING_MIDI[6 - string];
}

/** Fret played on `string` under `fingering` (0 = open when unfingered). */
export function fretOn(fingering: Fingering, string: number): number {
  for (const p of Object.values(fingering)) if (p && p.string === string) return p.fret;
  return 0;
}

/** Expected MIDI note per expected string (canonical = first accepted fingering). */
export function expectedNotes(step: LessonStep): ExpectedString[] {
  const canonical = step.accepted_fingerings[0];
  return step.expected_strings.map((s) => ({ string: s, midi: openMidi(s) + fretOn(canonical, s) }));
}
