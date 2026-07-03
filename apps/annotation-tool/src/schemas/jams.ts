// JAMS-style music annotation schema (§13 of the stack plan: "Formats: JAMS
// (music), COCO-style keypoints (vision), structured JSON (taxonomy)").
//
// This is a deliberately trimmed subset of the real JAMS spec
// (https://jams.readthedocs.io/) — full JAMS carries sandbox/curator/
// annotation_metadata blocks this internal tool has no use for. We keep the
// two structural pieces that matter for round-tripping music annotations:
// top-level file_metadata + an annotations array of
// {namespace, data: [{time, duration, value, confidence}]}. A real JAMS
// export (if ever needed) is a superset of this shape.
import { z } from "zod";

export const JamsObservationSchema = z.object({
  time: z.number().min(0),
  duration: z.number().min(0),
  value: z.unknown(), // JAMS values are namespace-dependent (chord label, MIDI note, onset flag, ...)
  confidence: z.number().min(0).max(1).nullable(),
});
export type JamsObservation = z.infer<typeof JamsObservationSchema>;

export const JamsAnnotationSchema = z.object({
  namespace: z.string().min(1), // e.g. "chord", "onset", "note_midi", "pitch_class"
  data: z.array(JamsObservationSchema),
});

export const JamsFileSchema = z.object({
  file_metadata: z.object({
    clipId: z.string().min(1),
    duration: z.number().min(0),
  }),
  annotations: z.array(JamsAnnotationSchema),
});
export type JamsFile = z.infer<typeof JamsFileSchema>;
