// COPY of the DIAGNOSIS_CODES taxonomy from apps/web/src/fusion/diagnosis.ts
// (WP-6). This is the exact mistake taxonomy (§9.1 of the stack plan) the
// fusion engine emits; the annotation tool's mistake-tagging UI must use
// EXACTLY these codes so labeled data lines up with what the model predicts.
// KEEP IN SYNC by hand — apps/web/src/fusion/diagnosis.ts is the source of
// truth and is owned by WP-4/WP-5, not this app.
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

/** Standard string-numbering convention used throughout the stack: 1 = high e … 6 = low E. */
export const STRING_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"] as const;
export type Finger = (typeof FINGERS)[number];
