// Pitch / frequency helpers shared across the audio DSP. Pure, no state.
// Standard-tuning open-string frequencies (Hz) and MIDI numbers, low→high:
//   E2 A2 D3 G3 B3 E4  → MIDI 40 45 50 55 59 64.
export const STANDARD_TUNING_HZ = [82.4069, 110.0, 146.832, 196.0, 246.942, 329.628];
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];
export const STANDARD_TUNING_NAMES = ["E2", "A2", "D3", "G3", "B3", "E4"];
export const PITCH_CLASS_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

const A4_HZ = 440;
const A4_MIDI = 69;

export function freqToMidi(hz: number): number {
  return 12 * Math.log2(hz / A4_HZ) + A4_MIDI;
}

export function midiToFreq(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export function freqToPitchClass(hz: number): number {
  return ((Math.round(freqToMidi(hz)) % 12) + 12) % 12;
}

export function midiToPitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** MIDI number → scientific pitch name, e.g. 45 → "A2", 64 → "E4". */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${PITCH_CLASS_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Cents deviation of `hz` from a target frequency (positive = sharp). */
export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/**
 * Nearest standard-tuning open string to a detected f0, by absolute cents
 * distance. Returns the 1-based string number in the STANDARD guitar convention
 * (1 = high e … 6 = low E — the AudioEvent `string` field), the note name, and
 * the signed cents offset. The tuning arrays are ordered low→high (index 0 =
 * low E), so the string number is `length − best` to flip into the convention.
 */
export function nearestString(hz: number): { string: number; name: string; cents: number } {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < STANDARD_TUNING_HZ.length; i++) {
    const c = Math.abs(centsBetween(hz, STANDARD_TUNING_HZ[i]));
    if (c < bestAbs) {
      bestAbs = c;
      best = i;
    }
  }
  return {
    string: STANDARD_TUNING_HZ.length - best, // index 0 (low E) → 6, index 5 (high e) → 1
    name: STANDARD_TUNING_NAMES[best],
    cents: centsBetween(hz, STANDARD_TUNING_HZ[best]),
  };
}
