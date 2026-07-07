// Lesson-facing practice tones (vision doc §4 MVP): data, not code.
import { DEFAULT_TONE, type ToneParams } from "./toneChain";

export const TONE_PRESETS: Record<string, ToneParams> = {
  "Clean Chord Practice": { ...DEFAULT_TONE, monitor: "amp", drive: 0.08, trebleDb: 2, gateDb: -70 },
  "Crunch Rhythm": { ...DEFAULT_TONE, monitor: "amp", drive: 0.45, bassDb: 2, midDb: -2, trebleDb: 3, presenceDb: 2 },
  "Lead Sustain": { ...DEFAULT_TONE, monitor: "amp", drive: 0.7, midDb: 3, trebleDb: 1, presenceDb: 3 },
  // Acoustic-guitar-through-a-mic (RESULT-003): a mic captures the room + broadband
  // hiss, and Drive distorts that noise into "crunch". So: almost no drive, a strong
  // gate to mute the noise between notes, and shelving EQ standing in for HP/LP —
  // the chain has no dedicated high-/low-pass, so a bass-shelf cut ≈ ~80–100 Hz
  // high-pass (kills proximity rumble) and a treble-shelf + presence cut ≈ a gentle
  // low-pass (tames broadband hiss). Numbers are a sane starting point — tune by ear
  // on real hardware. Same monitor:"amp" convention as the other presets (lessons
  // apply with preserveMonitor; the store forces monitor off on load — see toneStore).
  "Mic Input": {
    ...DEFAULT_TONE,
    monitor: "amp",
    drive: 0.06, // barely any: don't distort mic/room noise
    gateDb: -34, // strong gate — RESULT-003: aggressive gating audibly cut mic noise between notes
    bassDb: -4, // lowshelf@120 cut ≈ high-pass: trims proximity boom / low rumble
    midDb: 1, // keep the body of the acoustic
    trebleDb: -3, // highshelf@3200 cut ≈ gentle low-pass: tames broadband hiss
    presenceDb: -3, // pull down the 4.5 kHz presence peak where hiss/harshness sits
    volumeDb: -14, // moderate, a touch below default
  },
};
