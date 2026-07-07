// Pure note math for the theory layer. String numbering is the PROJECT
// standard: 1 = high e … 6 = low E (cc42d15) — hence high-e-first tuning.
export const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40] as const;

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

const NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NAME_TO_PC: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  F: 5, "E#": 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10,
  Bb: 10, B: 11, Cb: 11,
};

export function noteToPc(name: string): PitchClass {
  const pc = NAME_TO_PC[name.trim()];
  if (pc === undefined) throw new Error(`unknown note name: "${name}"`);
  return pc as PitchClass;
}

export function pcToName(pc: number, prefFlat = false): string {
  const i = ((pc % 12) + 12) % 12;
  return (prefFlat ? NAMES_FLAT : NAMES_SHARP)[i];
}

export function midiPc(midi: number): PitchClass {
  return (((midi % 12) + 12) % 12) as PitchClass;
}

/** MIDI note number → scientific pitch name (69 = A4). */
export function midiToName(midi: number): string {
  return `${NAMES_SHARP[midiPc(midi)]}${Math.floor(midi / 12) - 1}`;
}
