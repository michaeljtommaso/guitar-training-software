// Audio perception events (WP-2), shape-locked to opus-stack-implementation-
// plan §9.1. Kept in its own file so the parallel WP-3 vision leg can add
// VisionEvent to events.ts with no merge conflict here.
//
// All events are timestamped on the audio clock (ms) and confidence-tagged in
// [0,1]. `string` is a 1-based standard-tuning string (1 = low E … 6 = high E).
export type AudioEvent =
  | { t: number; kind: "onset"; strength: number; conf: number }
  | { t: number; kind: "chord"; label: string; conf: number } // label incl. 'noise' | 'silence'
  | { t: number; kind: "notes"; pitches: number[]; conf: number } // MIDI note numbers
  | { t: number; kind: "tuning"; string: number; cents: number };
