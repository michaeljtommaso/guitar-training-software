// Structured taxonomy-tag JSON schema (§13: "structured JSON (taxonomy)").
// This is also the tool's master per-clip session file: it carries the
// mistake-taxonomy tags PLUS the consent record, the fretboard-grid quad
// corners, and the per-frame finger assignments — everything except the
// music (jams.ts) and vision-keypoint (coco.ts) exports, which are separate
// files aimed at model training rather than at this tool's own state.
import { z } from "zod";
import { DIAGNOSIS_CODES } from "../shared/diagnosis";

export const ConsentSchema = z.object({
  given: z.boolean(),
  scope: z.string().min(1), // e.g. "internal-training-only", "controlled-session-2026-07"
  date: z.string().min(1), // ISO date
});
export type Consent = z.infer<typeof ConsentSchema>;

export const FingerAssignmentSchema = z.object({
  frame: z.number().int().min(0),
  t: z.number().min(0),
  finger: z.enum(["thumb", "index", "middle", "ring", "pinky"]),
  string: z.number().int().min(1).max(6), // 1 = high e … 6 = low E
  fret: z.number().int().min(0),
  // Video pixel coords of the click that produced this assignment, kept
  // alongside the derived (string,fret) so a COCO keypoints export can place
  // the fingertip precisely rather than at a fret-cell centroid.
  px: z.number().optional(),
  py: z.number().optional(),
});
export type FingerAssignment = z.infer<typeof FingerAssignmentSchema>;

export const TagRangeSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  code: z.enum(DIAGNOSIS_CODES),
  note: z.string().optional(),
});
export type TagRange = z.infer<typeof TagRangeSchema>;

export const QuadCornersSchema = z.tuple([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number()]),
]); // [topLeft, topRight, bottomRight, bottomLeft], video pixel space
export type QuadCorners = z.infer<typeof QuadCornersSchema>;

export const TaxonomyFileSchema = z.object({
  clipId: z.string().min(1),
  annotator: z.string().min(1),
  createdAt: z.string().min(1),
  consent: ConsentSchema,
  quad: QuadCornersSchema.nullable(),
  fingerAssignments: z.array(FingerAssignmentSchema),
  tags: z.array(TagRangeSchema),
});
export type TaxonomyFile = z.infer<typeof TaxonomyFileSchema>;
