// String-level audio validation (ADR-005): given the target fingering's
// expected notes and the detected note set, decide which strings are missing,
// which notes are extra, and which expected strings were possibly muted. This
// is the audio evidence the fusion engine (WP-4) consumes.
//
// Matching is by pitch class (mod 12): open-chord transcription is octave-
// unreliable, but pitch class is robust, and two strings sharing a pitch class
// (a doubled note) make an absence ambiguous — flagged, not asserted.
import { midiToPitchClass } from "./dsp/pitch";

export interface ExpectedString {
  /** 1-based string number (1 = low E … 6 = high E). */
  string: number;
  /** Expected MIDI note for that fretted/open string. */
  midi: number;
}

export interface StringValidation {
  /** Expected strings whose pitch class was not heard at all. */
  missing: number[];
  /** Detected MIDI notes matching no expected string. */
  extra: number[];
  /** Missing strings whose pitch class is NOT doubled by another sounding
   *  expected string — the strongest "you muted this" candidates. */
  possiblyMuted: number[];
}

export function validateStrings(
  expected: ExpectedString[],
  detectedMidi: number[],
): StringValidation {
  const detectedPcs = new Set(detectedMidi.map(midiToPitchClass));
  const expectedPcs = expected.map((e) => midiToPitchClass(e.midi));

  const missing: number[] = [];
  for (let i = 0; i < expected.length; i++) {
    if (!detectedPcs.has(expectedPcs[i])) missing.push(expected[i].string);
  }

  // Extra = detected pitch classes not expected by any string.
  const expectedPcSet = new Set(expectedPcs);
  const seenExtra = new Set<number>();
  const extra: number[] = [];
  for (const midi of detectedMidi) {
    const pc = midiToPitchClass(midi);
    if (!expectedPcSet.has(pc) && !seenExtra.has(pc)) {
      seenExtra.add(pc);
      extra.push(midi);
    }
  }

  // A missing string is a strong mute candidate only if a *sounding* expected
  // string doesn't already cover its pitch class (otherwise it's ambiguous).
  const soundingPcs = new Set(
    expected.filter((e) => detectedPcs.has(midiToPitchClass(e.midi))).map((e) => midiToPitchClass(e.midi)),
  );
  const possiblyMuted = missing.filter((str) => {
    const e = expected.find((x) => x.string === str)!;
    return !soundingPcs.has(midiToPitchClass(e.midi));
  });

  return { missing, extra, possiblyMuted };
}
