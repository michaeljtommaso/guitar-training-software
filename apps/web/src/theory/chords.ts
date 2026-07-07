// Adapter over @tombatossals/chords-db (MIT). The db orders string arrays
// low E → high e and stores frets RELATIVE to baseFret; this module is the
// ONLY place that convention exists — everything it emits is project order
// (string 1 = high e first) with ABSOLUTE frets. Lazy-loaded: the json is a
// deferred chunk so the 250 KB gz initial-bundle budget is untouched.

export interface Voicing {
  /** Per-string ABSOLUTE fret, index 0 = string 1 (high e). -1 muted, 0 open. */
  frets: number[];
  /** Per-string finger 0..4 (0 = none), same indexing. */
  fingers: number[];
  /** Barres as ABSOLUTE fret numbers. */
  barres: number[];
  baseFret: number;
  /** Strip display window hint: [startFret, endFret]. */
  window: [number, number];
  /** Sort key, lower = easier. */
  difficulty: number;
}

interface DbPosition {
  frets: number[]; fingers: number[]; barres: number[]; baseFret: number;
  capo?: boolean; midi?: number[];
}
interface DbChord { key: string; suffix: string; positions: DbPosition[] }
interface GuitarDb { chords: Record<string, DbChord[]>; suffixes: string[] }

export const CHORD_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/**
 * chords-db keys accidentals inconsistently (verified by the Task-3 probe):
 * C#/F# are keyed "Csharp"/"Fsharp", but D#/G#/A# are keyed as FLATS "Eb"/"Ab"/"Bb".
 */
const DB_KEY: Record<string, string> = {
  "C#": "Csharp", "D#": "Eb", "F#": "Fsharp", "G#": "Ab", "A#": "Bb",
};

let dbPromise: Promise<GuitarDb> | null = null;
function loadDb(): Promise<GuitarDb> {
  dbPromise ??= import("@tombatossals/chords-db/lib/guitar.json").then(
    (m) => (m as { default: GuitarDb }).default ?? (m as unknown as GuitarDb),
  );
  return dbPromise;
}

export function convertPosition(pos: DbPosition): Voicing {
  const abs = (f: number) => (f <= 0 ? f : f + pos.baseFret - 1);
  const frets = [...pos.frets].map(abs).reverse();
  const fingers = [...pos.fingers].reverse();
  const barres = pos.barres.map((b) => b + pos.baseFret - 1);
  const played = frets.filter((f) => f > 0);
  const maxFret = played.length ? Math.max(...played) : 0;
  const startFret = pos.baseFret === 1 ? 0 : pos.baseFret - 1;
  const window: [number, number] = [startFret, Math.max(startFret + 4, maxFret)];
  const difficulty =
    pos.baseFret * 10 + pos.barres.length * 5 + fingers.filter((f) => f > 0).length;
  return { frets, fingers, barres, baseFret: pos.baseFret, window, difficulty };
}

export async function chordVoicings(root: string, suffix: string): Promise<Voicing[]> {
  const db = await loadDb();
  const entry = (db.chords[DB_KEY[root] ?? root] ?? []).find((c) => c.suffix === suffix);
  if (!entry) return [];
  return entry.positions.map(convertPosition).sort((a, b) => a.difficulty - b.difficulty);
}

/** All suffixes the db knows, common ones first for picker UX. */
const COMMON = ["major", "minor", "7", "m7", "maj7", "sus2", "sus4"];
export async function chordSuffixes(): Promise<string[]> {
  const db = await loadDb();
  const rest = db.suffixes.filter((s) => !COMMON.includes(s));
  return [...COMMON.filter((s) => db.suffixes.includes(s)), ...rest];
}
