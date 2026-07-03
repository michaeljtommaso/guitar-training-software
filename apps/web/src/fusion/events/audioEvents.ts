// Audio perception events (WP-2), shape-locked to opus-stack-implementation-
// plan §9.1. Kept in its own file (alongside visionEvents.ts) so the two
// perception legs don't collide on merge; both are re-exported from ../index.ts.
//
// All events are timestamped on the audio clock (ms) and confidence-tagged in
// [0,1]. `string` is a 1-based STANDARD-convention string (1 = high e … 6 = low E)
// — see the authoritative note in ../index.ts.
export type AudioEvent =
  | { t: number; kind: "onset"; strength: number; conf: number }
  | { t: number; kind: "chord"; label: string; conf: number } // label incl. 'noise' | 'silence'
  | { t: number; kind: "notes"; pitches: number[]; conf: number } // MIDI note numbers
  | { t: number; kind: "tuning"; string: number; cents: number };
