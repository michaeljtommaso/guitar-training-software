// Lesson-facing practice tones (vision doc §4 MVP): data, not code.
import { DEFAULT_TONE, type ToneParams } from "./toneChain";

export const TONE_PRESETS: Record<string, ToneParams> = {
  "Clean Chord Practice": { ...DEFAULT_TONE, monitor: "amp", drive: 0.08, trebleDb: 2, gateDb: -70 },
  "Crunch Rhythm": { ...DEFAULT_TONE, monitor: "amp", drive: 0.45, bassDb: 2, midDb: -2, trebleDb: 3, presenceDb: 2 },
  "Lead Sustain": { ...DEFAULT_TONE, monitor: "amp", drive: 0.7, midDb: 3, trebleDb: 1, presenceDb: 3 },
};
