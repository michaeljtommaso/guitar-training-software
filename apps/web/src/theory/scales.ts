// Deterministic scale-position generator over standard tuning. Pure math —
// see spec §3.2 for the interval/degree tables.
import { STANDARD_TUNING_MIDI, midiPc, midiToName, noteToPc } from "./notes";

export type ScaleType = "major" | "minor" | "pentatonic_major" | "pentatonic_minor" | "blues";
export const SCALE_TYPES: ScaleType[] = ["major", "minor", "pentatonic_major", "pentatonic_minor", "blues"];

/** semitone-from-root → degree label, per scale type (spec §3.2). */
const SCALES: Record<ScaleType, Array<[number, string]>> = {
  major: [[0, "1"], [2, "2"], [4, "3"], [5, "4"], [7, "5"], [9, "6"], [11, "7"]],
  minor: [[0, "1"], [2, "2"], [3, "♭3"], [5, "4"], [7, "5"], [8, "♭6"], [10, "♭7"]],
  pentatonic_major: [[0, "1"], [2, "2"], [4, "3"], [7, "5"], [9, "6"]],
  pentatonic_minor: [[0, "1"], [3, "♭3"], [5, "4"], [7, "5"], [10, "♭7"]],
  blues: [[0, "1"], [3, "♭3"], [5, "4"], [6, "♭5"], [7, "5"], [10, "♭7"]],
};

export interface ScalePosition {
  string: number; // 1..6 (1 = high e)
  fret: number;
  midi: number;
  note: string;   // "G3"
  degree: string; // "1", "♭3", …
  isRoot: boolean;
}

export function scalePositions(
  root: string,
  type: ScaleType,
  opts: { maxFret?: number } = {},
): ScalePosition[] {
  const maxFret = opts.maxFret ?? 12;
  const rootPc = noteToPc(root);
  const degreeByInterval = new Map(SCALES[type]);
  const out: ScalePosition[] = [];
  STANDARD_TUNING_MIDI.forEach((openMidi, i) => {
    const string = i + 1;
    for (let fret = 0; fret <= maxFret; fret++) {
      const midi = openMidi + fret;
      const interval = (((midiPc(midi) - rootPc) % 12) + 12) % 12;
      const degree = degreeByInterval.get(interval);
      if (degree === undefined) continue;
      out.push({ string, fret, midi, note: midiToName(midi), degree, isRoot: interval === 0 });
    }
  });
  return out.sort((a, b) => a.string - b.string || a.fret - b.fret);
}
