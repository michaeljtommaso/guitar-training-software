// ── WP-3 vision events ──────────────────────────────────────────────────────
// The VisionEvent union from opus-stack-implementation-plan.md §9.1, implemented
// exactly. This is the shared event location for the fusion engine (WP-4). The
// WP-2 agent adds AudioEvent alongside (audioEvents.ts) — keep the two unions in
// separate files so the legs don't collide on merge.
//
// All events are timestamped (audioClock ms) and confidence-tagged [0..1].

/** One MediaPipe hand landmark: [x, y, z], x/y normalized to the video frame
 *  [0..1], z relative depth (also model-normalized). 21 per hand. */
export type Landmark = [number, number, number];

/** Handedness as reported by MediaPipe, collapsed to a single char.
 *  Note: from the *image's* perspective — a front (selfie) camera mirrors, so
 *  'R' here can be the player's left hand. Fusion resolves the mirror. */
export type Handedness = "L" | "R";

/** Fret-hand fingers we assign. Thumb is included but rarely frets in open
 *  chords; the mapper down-weights it. */
export type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";

/** A single fingertip → fretboard-cell assignment. string 1..6 (1 = high e,
 *  6 = low E); fret 0..N (0 = open/behind the nut). */
export interface FingerAssign {
  finger: Finger;
  string: number;
  fret: number;
  conf: number;
  /** WP-4 additive field: normalized distance BEHIND the leading fret line —
   *  the fusion engine needs it for the §9.1 `behind_fret` diagnosis. Optional
   *  so older producers/fixtures remain valid. */
  behindFretDist?: number;
}

export type StrumDir = "down" | "up" | "none";

export type VisionEvent =
  | { t: number; kind: "hand"; landmarks: Landmark[]; handed: Handedness; conf: number }
  | { t: number; kind: "fingerAssign"; assigns: FingerAssign[] }
  | { t: number; kind: "calib"; homographyConf: number }
  | { t: number; kind: "strum"; dir: StrumDir; conf: number };

/** Narrow VisionEvent by its `kind` tag (convenience for consumers). */
export type VisionEventOf<K extends VisionEvent["kind"]> = Extract<VisionEvent, { kind: K }>;
