# Explore Mode v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chord/scale explore mode — pick any chord voicing or scale, see it on a schematic SVG fretboard strip (no camera needed) and projected onto the live camera when calibrated, with input-quality-keyed listening feedback.

**Architecture:** Pure `theory/` layer (note math, scale generator, chords-db adapter) feeds an `explore/` feature slice (zustand store + hot ref, feedback reducer, SVG strip, panel) and one new geometry function in the existing overlay. The fusion engine is never touched; explore produces no diagnoses or hints.

**Tech Stack:** React 18 + TypeScript + Vite, zustand 5, vitest + @testing-library, Playwright e2e, `@tombatossals/chords-db` (MIT, lazy-loaded).

**Spec:** `docs/superpowers/specs/2026-07-07-explore-mode-design.md` — binding. Where this plan and the spec disagree, STOP and flag it.

## Global Constraints

- String numbering: **1 = high e … 6 = low E** everywhere (commit cc42d15 convention). Converters from external data are the only place the other order may exist, and only inside the conversion function.
- `STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40]` — index 0 = string 1 (high e).
- License firewall (ADR-011): only MIT/BSD/Apache/CC0/CC-BY additions; `pnpm license-check` must stay green.
- Initial JS bundle ≤ 250 KB gz (`pnpm bundle-size`); chords-db must land in a **deferred** chunk (dynamic `import()`).
- `fusion/engine.ts`, `fusion/fusionStore.ts` internals are read-only except where a task names an exact call (`stopLesson()`).
- ADR-007: no calibration → no camera dots, ever. Explore adds no exception.
- Camera dots with `fret > MAX_FRET` (= 5) are skipped in v1.
- All tunable constants are named, exported, doc-commented (`SILENCE_RMS` convention).
- Commands run via `npx --yes pnpm@11.9.0 …` if `pnpm` is not on PATH (known env quirk). Test command: `npx --yes pnpm@11.9.0 --filter ./apps/web test -- run <file>`.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Parallelization map (for the orchestrator)

- **Wave 1 (parallel):** Task 1+2 (one agent — same tiny layer), Task 3, Task 6 (strip consumes only types, which are defined verbatim in this plan).
- **Wave 2 (parallel, after wave 1 merges):** Task 4, Task 5, Task 7.
- **Wave 3 (sequential):** Task 8, then Task 9.

---

### Task 1: `theory/notes.ts` — note/pitch-class/midi helpers

**Files:**
- Create: `apps/web/src/theory/notes.ts`
- Test: `apps/web/src/theory/notes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `STANDARD_TUNING_MIDI`, `type PitchClass`, `noteToPc(name: string): PitchClass`, `pcToName(pc: number, prefFlat?: boolean): string`, `midiPc(midi: number): PitchClass`, `midiToName(midi: number): string`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/theory/notes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STANDARD_TUNING_MIDI, noteToPc, pcToName, midiPc, midiToName } from "./notes";

describe("notes", () => {
  it("standard tuning is high-e-first (project string numbering)", () => {
    expect(STANDARD_TUNING_MIDI).toEqual([64, 59, 55, 50, 45, 40]); // e4 B3 G3 D3 A2 E2
  });
  it("maps names to pitch classes incl. enharmonics", () => {
    expect(noteToPc("C")).toBe(0);
    expect(noteToPc("C#")).toBe(1);
    expect(noteToPc("Db")).toBe(1);
    expect(noteToPc("Bb")).toBe(10);
    expect(noteToPc("E#")).toBe(5);
  });
  it("throws on garbage", () => {
    expect(() => noteToPc("H")).toThrow();
    expect(() => noteToPc("")).toThrow();
  });
  it("pcToName honors flat preference", () => {
    expect(pcToName(1)).toBe("C#");
    expect(pcToName(1, true)).toBe("Db");
  });
  it("midi helpers", () => {
    expect(midiPc(40)).toBe(4);        // E2 → E
    expect(midiToName(40)).toBe("E2");
    expect(midiToName(64)).toBe("E4");
    expect(midiToName(61)).toBe("C#4");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx --yes pnpm@11.9.0 --filter ./apps/web test -- run src/theory/notes.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/web/src/theory/notes.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS (5 tests).
- [ ] **Step 5: Commit** — `git add apps/web/src/theory && git commit -m "feat(theory): note/pitch-class/midi helpers"` (+ trailer).

---

### Task 2: `theory/scales.ts` — scale position generator

**Files:**
- Create: `apps/web/src/theory/scales.ts`
- Test: `apps/web/src/theory/scales.test.ts`

**Interfaces:**
- Consumes: `STANDARD_TUNING_MIDI`, `noteToPc`, `midiPc`, `midiToName` from Task 1.
- Produces: `type ScaleType`, `interface ScalePosition { string; fret; midi; note; degree; isRoot }`, `scalePositions(root: string, type: ScaleType, opts?: { maxFret?: number }): ScalePosition[]`, `SCALE_TYPES: ScaleType[]`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/theory/scales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scalePositions } from "./scales";

describe("scalePositions", () => {
  it("G major on string 6 (low E), frets 0-12, is exactly the G major pitches", () => {
    const s6 = scalePositions("G", "major", { maxFret: 12 })
      .filter((p) => p.string === 6)
      .map((p) => ({ fret: p.fret, degree: p.degree }));
    // E2 string: F#(2)=7th, G(3)=root, A(5)=2, B(7)=3, C(8)=4, D(10)=5, E(0/12)=6
    expect(s6).toEqual([
      { fret: 0, degree: "6" }, { fret: 2, degree: "7" }, { fret: 3, degree: "1" },
      { fret: 5, degree: "2" }, { fret: 7, degree: "3" }, { fret: 8, degree: "4" },
      { fret: 10, degree: "5" }, { fret: 12, degree: "6" },
    ]);
  });
  it("flags roots and names notes", () => {
    const roots = scalePositions("G", "major", { maxFret: 12 }).filter((p) => p.isRoot);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((p) => p.note.startsWith("G"))).toBe(true);
    expect(roots.every((p) => p.degree === "1")).toBe(true);
  });
  it("A minor pentatonic, string 1 (high e), frets 0-12 — exact set", () => {
    const s1 = scalePositions("A", "pentatonic_minor", { maxFret: 12 })
      .filter((p) => p.string === 1).map((p) => p.fret);
    // e4 string pcs: A=5, C=8, D=10, E=0/12, G=3
    expect(s1).toEqual([0, 3, 5, 8, 10, 12]);
  });
  it("minor scale uses flat degree labels", () => {
    const degs = new Set(scalePositions("A", "minor").map((p) => p.degree));
    expect(degs).toEqual(new Set(["1", "2", "♭3", "4", "5", "♭6", "♭7"]));
  });
  it("sorted by string then fret; default maxFret 12", () => {
    const all = scalePositions("C", "blues");
    const sorted = [...all].sort((a, b) => a.string - b.string || a.fret - b.fret);
    expect(all).toEqual(sorted);
    expect(Math.max(...all.map((p) => p.fret))).toBeLessThanOrEqual(12);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module not found).
- [ ] **Step 3: Implement** — `apps/web/src/theory/scales.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes** → PASS (5 tests).
- [ ] **Step 5: Commit** — `git commit -m "feat(theory): scale position generator (major/minor/pentatonics/blues)"` (+ trailer).

---

### Task 3: chords-db adapter — `theory/chords.ts`

**Files:**
- Modify: `apps/web/package.json` (add dependency)
- Create: `apps/web/src/theory/chords.ts`
- Test: `apps/web/src/theory/chords.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained types).
- Produces: `interface Voicing { frets: number[]; fingers: number[]; barres: number[]; baseFret: number; window: [number, number]; difficulty: number }`, `chordVoicings(root: string, suffix: string): Promise<Voicing[]>`, `chordSuffixes(): Promise<string[]>`, `CHORD_ROOTS: string[]`, and (exported for tests) `convertPosition(dbPos): Voicing`.

- [ ] **Step 1: Install + probe the real data shape.** Run:

```bash
npx --yes pnpm@11.9.0 --filter ./apps/web add @tombatossals/chords-db
node -e "const g=require('./apps/web/node_modules/@tombatossals/chords-db/lib/guitar.json'); console.log(Object.keys(g)); console.log(JSON.stringify(g.chords.C.find(c=>c.suffix==='major').positions[0],null,1)); console.log(Object.keys(g.chords).slice(0,14));"
```

Record in the task report: the top-level keys, the exact C-major first-position object (expected fields: `frets`, `fingers`, `barres`, `capo?`, `baseFret`, `midi` — arrays ordered **low E → high e**, frets **relative** to `baseFret`), and how sharps are keyed in `g.chords` (expected `"Csharp"` style). If ANY of those expectations is wrong, adjust the constants/conversion below to the real shape and say so in the report — the tests in Step 2 pin whichever reality you found.

- [ ] **Step 2: Write the failing test** — `apps/web/src/theory/chords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHORD_ROOTS, chordVoicings, convertPosition } from "./chords";

describe("chords-db adapter", () => {
  it("converts db order (low-E-first) to project order (high-e-first) — C major open", () => {
    // db C major open: frets [x,3,2,0,1,0] low-E-first, baseFret 1
    const v = convertPosition({ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], barres: [], baseFret: 1 });
    expect(v.frets).toEqual([0, 1, 0, 2, 3, -1]);   // string 1 (high e) first
    expect(v.fingers).toEqual([0, 1, 0, 2, 3, 0]);
    expect(v.baseFret).toBe(1);
  });
  it("makes shifted-shape frets and barres ABSOLUTE — C#m style @ baseFret 4", () => {
    const v = convertPosition({ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barres: [1], baseFret: 4 });
    // absolute = rel + baseFret - 1 → [4,6,6,5,4,4] low-E-first → reversed
    expect(v.frets).toEqual([4, 4, 5, 6, 6, 4]);
    expect(v.barres).toEqual([4]);
    expect(v.window[0]).toBe(3); // baseFret-1
  });
  it("loads real Am voicings, open shape first (difficulty sort)", async () => {
    const vs = await chordVoicings("A", "minor");
    expect(vs.length).toBeGreaterThan(1);
    expect(vs[0].baseFret).toBe(1);
    expect(vs[0].barres).toEqual([]);
    // open Am: x02210 low-E-first → ours [0,1,2,2,0,-1]
    expect(vs[0].frets).toEqual([0, 1, 2, 2, 0, -1]);
  });
  it("resolves sharp roots and unknown chords", async () => {
    expect((await chordVoicings("C#", "minor")).length).toBeGreaterThan(0);
    expect(await chordVoicings("C", "nonsense-suffix")).toEqual([]);
  });
  it("exports 12 roots", () => {
    expect(CHORD_ROOTS).toHaveLength(12);
    expect(CHORD_ROOTS).toContain("C#");
  });
});
```

- [ ] **Step 3: Run to verify it fails** → FAIL (module not found).
- [ ] **Step 4: Implement** — `apps/web/src/theory/chords.ts`:

```ts
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
/** chords.db keys sharps as e.g. "Csharp" (verified by the Task-3 probe). */
const DB_KEY: Record<string, string> = {
  "C#": "Csharp", "D#": "Dsharp", "F#": "Fsharp", "G#": "Gsharp", "A#": "Asharp",
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
```

If Step 1's probe contradicted an assumption (import path, sharp keys, field names, relative frets), fix THIS file and the Step-2 fixtures together, and record the delta in the report.

- [ ] **Step 5: Run to verify it passes** → PASS (5 tests). Also run `npx --yes pnpm@11.9.0 license-check` → PASS and `npx --yes pnpm@11.9.0 build && npx --yes pnpm@11.9.0 bundle-size` → initial budget unchanged (json must appear as a deferred chunk; if it lands in the initial bundle, the dynamic import got inlined — fix before proceeding).
- [ ] **Step 6: Commit** — `git commit -m "feat(theory): chords-db adapter — project string order, absolute frets, lazy load"` (+ trailer).

---

### Task 4: `explore/exploreStore.ts` — state + hot ref

**Files:**
- Create: `apps/web/src/explore/exploreStore.ts`
- Test: `apps/web/src/explore/exploreStore.test.ts`

**Interfaces:**
- Consumes: `Voicing`, `chordVoicings` (Task 3); `ScalePosition`, `ScaleType`, `scalePositions` (Task 2); `stopLesson` from `../fusion/fusionStore`; `classifyAudioInput` from `../capture/devices`; `useCaptureStore` from `../capture/captureStore`.
- Produces: `type ExploreTarget`, `type FeedbackTier = "auto" | "light" | "full"`, `useExploreStore`, `exploreHot: { target: ExploreTarget; heard: HeardState }` (mutable module object read by the frame loop), `resolveTier(tier: FeedbackTier, micLabel: string): "light" | "full"` (pure, exported for tests). `HeardState` is imported as a type from `./feedback` (Task 5 defines it; for wave-parallelism declare it locally as `import type { HeardState } from "./feedback"` — Task 5 creates the module; if executing before Task 5 exists, create `feedback.ts` containing ONLY the `HeardState` interface exactly as written in Task 5 Step 3, and Task 5 fills in the rest).

- [ ] **Step 1: Write the failing test** — `apps/web/src/explore/exploreStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../fusion/fusionStore", () => ({ stopLesson: vi.fn() }));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4] as [number, number], difficulty: 13 },
    { frets: [5, 5, 5, 7, 7, 5], fingers: [1, 1, 1, 3, 4, 1], barres: [5], baseFret: 5, window: [4, 8] as [number, number], difficulty: 61 },
  ]),
}));

import { stopLesson } from "../fusion/fusionStore";
import { exploreHot, resolveTier, useExploreStore } from "./exploreStore";

describe("exploreStore", () => {
  beforeEach(() => {
    useExploreStore.getState().setMode("practice");
    vi.clearAllMocks();
  });
  it("entering explore stops any lesson; leaving clears the hot target", async () => {
    useExploreStore.getState().setMode("explore");
    expect(stopLesson).toHaveBeenCalledOnce();
    await useExploreStore.getState().setChord("A", "minor");
    expect(exploreHot.target?.kind).toBe("chord");
    useExploreStore.getState().setMode("practice");
    expect(exploreHot.target).toBeNull();
  });
  it("setChord loads voicings, resets active to 0; setVoicing clamps", async () => {
    useExploreStore.getState().setMode("explore");
    await useExploreStore.getState().setChord("A", "minor");
    const t = useExploreStore.getState().target;
    expect(t?.kind === "chord" && t.voicings.length).toBe(2);
    useExploreStore.getState().setVoicing(99);
    const t2 = useExploreStore.getState().target;
    expect(t2?.kind === "chord" && t2.active).toBe(1); // clamped to last
  });
  it("setScale builds positions synchronously", () => {
    useExploreStore.getState().setMode("explore");
    useExploreStore.getState().setScale("G", "major");
    const t = useExploreStore.getState().target;
    expect(t?.kind === "scale" && t.positions.length).toBeGreaterThan(20);
    expect(exploreHot.target).toBe(t);
  });
  it("resolveTier: auto keys off input classification", () => {
    expect(resolveTier("auto", "Scarlett 2i2 USB")).toBe("full");
    expect(resolveTier("auto", "Built-in Microphone Array")).toBe("light");
    expect(resolveTier("light", "Scarlett 2i2 USB")).toBe("light");
    expect(resolveTier("full", "whatever")).toBe("full");
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement** — `apps/web/src/explore/exploreStore.ts`:

```ts
// Explore-mode state. Coarse UI state in zustand (captureStore pattern);
// exploreHot is the module-level mutable snapshot the overlay frame loop reads
// without React (ADR-002 discipline, same as fusionHot). Explore NEVER feeds
// the fusion engine — entering explore stops any active lesson instead.
import { create } from "zustand";
import { classifyAudioInput } from "../capture/devices";
import { useCaptureStore } from "../capture/captureStore";
import { stopLesson } from "../fusion/fusionStore";
import { scalePositions, type ScalePosition, type ScaleType } from "../theory/scales";
import { chordVoicings, type Voicing } from "../theory/chords";
import type { HeardState } from "./feedback";

export type ExploreTarget =
  | { kind: "chord"; root: string; suffix: string; voicings: Voicing[]; active: number }
  | { kind: "scale"; root: string; scaleType: ScaleType; positions: ScalePosition[] }
  | null;

export type FeedbackTier = "auto" | "light" | "full";

export const exploreHot: { target: ExploreTarget; heard: HeardState } = {
  target: null,
  heard: { chordHeard: false },
};

/** Pure tier resolution: auto → full only on a classified direct-input device. */
export function resolveTier(tier: FeedbackTier, micLabel: string): "light" | "full" {
  if (tier !== "auto") return tier;
  return classifyAudioInput(micLabel) === "interface" ? "full" : "light";
}

interface ExploreState {
  mode: "practice" | "explore";
  target: ExploreTarget;
  tier: FeedbackTier;
  loadError: string | null;
  setMode(m: "practice" | "explore"): void;
  setChord(root: string, suffix: string): Promise<void>;
  setScale(root: string, scaleType: ScaleType): void;
  setVoicing(i: number): void;
  setTier(t: FeedbackTier): void;
}

export const useExploreStore = create<ExploreState>()((set, get) => ({
  mode: "practice",
  target: null,
  tier: "auto",
  loadError: null,
  setMode(mode) {
    if (mode === "explore" && get().mode !== "explore") stopLesson();
    if (mode === "practice") exploreHot.target = null;
    set({ mode, ...(mode === "practice" ? { target: null } : null) });
  },
  async setChord(root, suffix) {
    try {
      const voicings = await chordVoicings(root, suffix);
      const target: ExploreTarget = { kind: "chord", root, suffix, voicings, active: 0 };
      exploreHot.target = target;
      set({ target, loadError: null });
    } catch (err) {
      set({ loadError: `chord library unavailable — ${String(err)}` });
    }
  },
  setScale(root, scaleType) {
    const target: ExploreTarget = { kind: "scale", root, scaleType, positions: scalePositions(root, scaleType) };
    exploreHot.target = target;
    set({ target, loadError: null });
  },
  setVoicing(i) {
    const t = get().target;
    if (t?.kind !== "chord" || !t.voicings.length) return;
    const active = Math.min(Math.max(i, 0), t.voicings.length - 1);
    const target = { ...t, active };
    exploreHot.target = target;
    set({ target });
  },
  setTier(tier) {
    set({ tier });
  },
}));

/** Resolved tier against the CURRENT capture mic (UI + feedback both use this). */
export function currentResolvedTier(): "light" | "full" {
  const { mics, micId } = useCaptureStore.getState();
  const label = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  return resolveTier(useExploreStore.getState().tier, label);
}
```

- [ ] **Step 4: Run to verify it passes** → PASS. (If Task 5 hasn't run yet, create `apps/web/src/explore/feedback.ts` containing only the `HeardState` interface from Task 5 Step 3.)
- [ ] **Step 5: Commit** — `git commit -m "feat(explore): explore store — mode rules, hot ref, tier resolution"` (+ trailer).

---

### Task 5: `explore/feedback.ts` + controller tap

**Files:**
- Create: `apps/web/src/explore/feedback.ts`
- Modify: `apps/web/src/capture/controller.ts` (ONE added import + ONE added call, next to the existing audio `fusionIngest(...)` forwarding — find it with `grep -n "fusionIngest" apps/web/src/capture/controller.ts`; touch nothing else in the file)
- Test: `apps/web/src/explore/feedback.test.ts`

**Interfaces:**
- Consumes: `exploreHot`, `useExploreStore`, `currentResolvedTier` (Task 4); `STANDARD_TUNING_MIDI` (Task 1). Audio event shapes: import the EXISTING types — run `grep -rn "kind: \"chord\"\|kind: \"notes\"\|interface.*Event" apps/web/src/perception/audio/analysis.ts apps/web/src/fusion/events/` and import the chord/notes event types from where they are exported (do NOT redefine shapes; if the notes stream arrives via a different message than `fusionIngest`'s events, tap the same place fusion taps it and record the actual wiring in the report).
- Produces: `interface HeardState { chordHeard: boolean; strings?: Array<"ok" | "pending" | "muted-expected"> }`, `exploreIngest(events: unknown[]): void`, constants `LIGHT_CONF = 0.5`, `HOLD_MS = 1500`, `SEMITONE_TOL = 1`, and (pure, for tests) `class ExploreFeedback { ingest(events, tMs): void; heard(target, tier, tMs): HeardState }`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/explore/feedback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ExploreFeedback, HOLD_MS, LIGHT_CONF } from "./feedback";
import type { ExploreTarget } from "./exploreStore";

const AM: ExploreTarget = {
  kind: "chord", root: "A", suffix: "minor", active: 0,
  voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
};

describe("ExploreFeedback", () => {
  it("light: chord label match above LIGHT_CONF holds for HOLD_MS", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: LIGHT_CONF + 0.1, t: 1000 }], 1000);
    expect(f.heard(AM, "light", 1000).chordHeard).toBe(true);
    expect(f.heard(AM, "light", 1000 + HOLD_MS - 1).chordHeard).toBe(true);
    expect(f.heard(AM, "light", 1000 + HOLD_MS + 1).chordHeard).toBe(false);
  });
  it("light: below-confidence or wrong label does not trigger", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: 0.2, t: 0 }], 0);
    f.ingest([{ kind: "chord", label: "E", conf: 0.9, t: 0 }], 0);
    expect(f.heard(AM, "light", 0).chordHeard).toBe(false);
  });
  it("full: per-string midi matching against the voicing", () => {
    const f = new ExploreFeedback();
    // Am open expected midi (string 1..6): e4=64, C4=60, A3=57, E3=52, A2=45, muted
    f.ingest([{ kind: "notes", notes: [{ midi: 60, t: 500 }, { midi: 45, t: 500 }] }], 500);
    const h = f.heard(AM, "full", 600);
    expect(h.strings).toEqual(["pending", "ok", "pending", "pending", "ok", "muted-expected"]);
  });
  it("full with no note evidence degrades to all-pending, chordHeard still works", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: 0.9, t: 0 }], 0);
    const h = f.heard(AM, "full", 10);
    expect(h.chordHeard).toBe(true);
    expect(h.strings).toEqual(["pending", "pending", "pending", "pending", "pending", "muted-expected"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement** — `apps/web/src/explore/feedback.ts`:

```ts
// Explore listening feedback. AUDIO ONLY, and deliberately dumb: no diagnoses,
// no hints, no negative judgments — we mark what was HEARD, never what was
// wrong (spec §6). Pure core (ExploreFeedback) + a module singleton wired to
// the capture controller's audio-event forwarding.
import { STANDARD_TUNING_MIDI } from "../theory/notes";
import { exploreHot, useExploreStore, currentResolvedTier, type ExploreTarget } from "./exploreStore";

/** Min chord-classifier confidence for the light-tier "heard it" glow. Phase-0
 *  value; tune on hardware like SILENCE_RMS. */
export const LIGHT_CONF = 0.5;
/** How long a hit stays lit (ms). */
export const HOLD_MS = 1500;
/** Full-tier note match tolerance (semitones). */
export const SEMITONE_TOL = 1;

export interface HeardState {
  chordHeard: boolean;
  strings?: Array<"ok" | "pending" | "muted-expected">;
}

/** The 8-template label the audio leg emits for a chord we can listen for, or
 *  null when the classifier can't know this chord (spec §6 honesty rule). */
export function listenableLabel(root: string, suffix: string): string | null {
  const map: Record<string, string> = { major: "", minor: "m" };
  if (!(suffix in map)) return null;
  const label = `${root}${map[suffix]}`;
  const TEMPLATE_LABELS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm"]; // WP-2 open set
  return TEMPLATE_LABELS.includes(label) ? label : null;
}

export class ExploreFeedback {
  private chordHit: { label: string; t: number } | null = null;
  private noteHits = new Map<number, number>(); // midi → last-heard tMs

  ingest(events: unknown[], tMs: number): void {
    for (const e of events as Array<Record<string, unknown>>) {
      if (!e || typeof e !== "object") continue;
      if (e.kind === "chord" && typeof e.label === "string" && typeof e.conf === "number") {
        if (e.conf >= LIGHT_CONF) this.chordHit = { label: e.label, t: tMs };
      }
      if (e.kind === "notes" && Array.isArray(e.notes)) {
        for (const n of e.notes as Array<{ midi?: number }>) {
          if (typeof n.midi === "number") this.noteHits.set(Math.round(n.midi), tMs);
        }
      }
    }
  }

  heard(target: ExploreTarget, tier: "light" | "full", tMs: number): HeardState {
    if (!target) return { chordHeard: false };
    const chordHeard = this.chordHeardFor(target, tMs);
    if (tier === "light" || target.kind !== "chord") return { chordHeard };
    const v = target.voicings[target.active];
    if (!v) return { chordHeard };
    const strings = v.frets.map((fret, i) => {
      if (fret < 0) return "muted-expected" as const;
      const expected = STANDARD_TUNING_MIDI[i] + fret;
      for (let m = expected - SEMITONE_TOL; m <= expected + SEMITONE_TOL; m++) {
        const at = this.noteHits.get(m);
        if (at !== undefined && tMs - at <= HOLD_MS) return "ok" as const;
      }
      return "pending" as const;
    });
    return { chordHeard, strings };
  }

  private chordHeardFor(target: NonNullable<ExploreTarget>, tMs: number): boolean {
    if (!this.chordHit || tMs - this.chordHit.t > HOLD_MS) return false;
    if (target.kind !== "chord") return false;
    const want = listenableLabel(target.root, target.suffix);
    return want !== null && this.chordHit.label === want;
  }
}

const singleton = new ExploreFeedback();

/** Called by capture/controller.ts wherever it forwards audio events to fusion.
 *  No-op outside explore mode — the controller stays dumb. */
export function exploreIngest(events: unknown[]): void {
  if (useExploreStore.getState().mode !== "explore") return;
  const tMs = performance.now();
  singleton.ingest(events, tMs);
  exploreHot.heard = singleton.heard(exploreHot.target, currentResolvedTier(), tMs);
}
```

Adjust `ingest`'s event-field reads to the REAL event shapes found in the Step-1 grep (e.g. if notes arrive as `{ kind: "notes", pitches: [...] }` or via a separate stream, match reality and update the test fixtures identically — the test shapes and the code must both mirror the real stream, and the report must say what the real shapes were).

- [ ] **Step 4: Wire the controller tap.** In `apps/web/src/capture/controller.ts`, next to the existing audio-events `fusionIngest(events, "audio")` call add `exploreIngest(events);` (plus the import). If notes events flow through a DIFFERENT forwarding point (the notes worker's message handler), add the same one-line tap there instead/additionally — report which.
- [ ] **Step 5: Run to verify it passes** — feedback tests PASS, then the FULL web suite (`npx --yes pnpm@11.9.0 --filter ./apps/web test`) to prove the controller tap broke nothing.
- [ ] **Step 6: Commit** — `git commit -m "feat(explore): tiered listening feedback + controller audio tap"` (+ trailer).

---

### Task 6: `explore/FretboardStrip.tsx` — schematic SVG strip

**Files:**
- Modify: `apps/web/src/perception/vision/fretboard.ts` (add windowed spacing helper; keep existing exports byte-compatible)
- Create: `apps/web/src/explore/FretboardStrip.tsx`
- Test: `apps/web/src/explore/FretboardStrip.test.tsx`, extend `apps/web/src/perception/vision/` fretboard tests if a dedicated file exists (find with `ls apps/web/src/perception/vision/*.test.ts`)

**Interfaces:**
- Consumes: `ExploreTarget` type (Task 4 — type-only import), `HeardState` (Task 5 type).
- Produces: `FretboardStrip` React component with props `{ target: ExploreTarget; window?: [number, number]; heard?: HeardState }`; `fretX(fret: number, start: number, end: number): number` exported from `fretboard.ts` (normalized 0..1 x of fret line within an arbitrary window, same equal-tempered curve as `fretLineX`).

- [ ] **Step 1: Failing geometry test** — add to the existing fretboard test file (or create `fretboard.window.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { fretLineX, fretX, MAX_FRET } from "./fretboard";

describe("fretX (windowed spacing)", () => {
  it("degenerates to fretLineX over the default window", () => {
    for (let n = 0; n <= MAX_FRET; n++) {
      expect(fretX(n, 0, MAX_FRET)).toBeCloseTo(fretLineX(n), 10);
    }
  });
  it("spans 0..1 across any window, monotonically", () => {
    expect(fretX(3, 3, 8)).toBe(0);
    expect(fretX(8, 3, 8)).toBe(1);
    expect(fretX(5, 3, 8)).toBeGreaterThan(fretX(4, 3, 8));
  });
});
```

- [ ] **Step 2: Implement `fretX`** in `fretboard.ts` (place next to `fretLineX`, and reimplement `fretLineX(n)` as `fretX(n, 0, MAX_FRET)` so there is ONE spacing formula):

```ts
/** Equal-tempered fret-line position normalized to an arbitrary window
 *  [start, end] (0 at start's line, 1 at end's). Generalizes fretLineX. */
export function fretX(n: number, start: number, end: number): number {
  const pos = (f: number) => 1 - Math.pow(2, -f / 12);
  return (pos(n) - pos(start)) / (pos(end) - pos(start));
}
```

Run the existing full fretboard + targetDots + overlay test files — they pin `fretLineX` behavior and MUST stay green (this proves the refactor is behavior-preserving).

- [ ] **Step 3: Failing strip test** — `apps/web/src/explore/FretboardStrip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FretboardStrip } from "./FretboardStrip";
import type { ExploreTarget } from "./exploreStore";

const AM: ExploreTarget = {
  kind: "chord", root: "A", suffix: "minor", active: 0,
  voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
};
const GMAJ: ExploreTarget = {
  kind: "scale", root: "G", scaleType: "major",
  positions: [
    { string: 6, fret: 3, midi: 43, note: "G2", degree: "1", isRoot: true },
    { string: 5, fret: 0, midi: 45, note: "A2", degree: "2", isRoot: false },
  ],
};

describe("FretboardStrip", () => {
  it("chord mode: one finger dot per fretted string, open circles, muted ×", () => {
    const { container } = render(<FretboardStrip target={AM} />);
    expect(container.querySelectorAll("[data-dot='finger']")).toHaveLength(3); // frets 1,2,2
    expect(container.querySelectorAll("[data-dot='open']")).toHaveLength(2);   // strings 1,5
    expect(container.querySelectorAll("[data-dot='muted']")).toHaveLength(1);  // string 6
    expect(container.textContent).toContain("1"); // finger numbers rendered
  });
  it("scale mode: root filled + degree labels", () => {
    const { container } = render(<FretboardStrip target={GMAJ} window={[0, 12]} />);
    const root = container.querySelector("[data-dot='root']");
    expect(root).not.toBeNull();
    expect(container.textContent).toContain("2");
  });
  it("full-tier heard state renders per-string ticks", () => {
    const { container } = render(
      <FretboardStrip target={AM} heard={{ chordHeard: true, strings: ["ok", "ok", "pending", "pending", "ok", "muted-expected"] }} />,
    );
    expect(container.querySelectorAll("[data-tick='ok']")).toHaveLength(3);
  });
  it("null target renders an empty board without crashing", () => {
    const { container } = render(<FretboardStrip target={null} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

- [ ] **Step 4: Implement** — `apps/web/src/explore/FretboardStrip.tsx`:

```tsx
// Schematic fretboard strip (the v2-prototype "fretboard zoom" panel, camera-
// free). Pure presentational: parent passes target/heard; no store reads.
// Layout: string 1 (high e) on TOP (prototype convention); x from the shared
// equal-tempered fretX(); finger dots use the lessons' 70%-behind-the-fret
// convention.
import { fretX } from "../perception/vision/fretboard";
import type { ExploreTarget } from "./exploreStore";
import type { HeardState } from "./feedback";

export interface FretboardStripProps {
  target: ExploreTarget;
  window?: [number, number];
  heard?: HeardState;
}

const W = 720, H = 180, PAD_X = 34, PAD_Y = 18;
const BEHIND = 0.7; // keep in sync with overlay/targetDots.ts

export function FretboardStrip({ target, window: win, heard }: FretboardStripProps) {
  const [a, b] =
    win ?? (target?.kind === "chord" ? target.voicings[target.active]?.window ?? [0, 5] : [0, 12]);
  const x = (fret: number) => PAD_X + fretX(fret, a, b) * (W - 2 * PAD_X);
  const dotX = (fret: number) =>
    fret <= a ? x(a) : x(fret - 1 < a ? a : fret - 1) + BEHIND * (x(fret) - x(fret - 1 < a ? a : fret - 1));
  const y = (string: number) => PAD_Y + ((string - 1) / 5) * (H - 2 * PAD_Y);

  const frets: number[] = [];
  for (let f = a; f <= b; f++) frets.push(f);

  const v = target?.kind === "chord" ? target.voicings[target.active] : undefined;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`fret-strip ${heard?.chordHeard ? "heard" : ""}`} data-testid="fretboard-strip" role="img" aria-label="fretboard">
      {/* board */}
      {frets.map((f) => (
        <line key={`f${f}`} x1={x(f)} y1={y(1)} x2={x(f)} y2={y(6)} className={f === 0 ? "nut" : "fret"} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={`s${s}`} x1={x(a)} y1={y(s)} x2={x(b)} y2={y(s)} className="string" />
      ))}
      {/* chord voicing */}
      {v?.barres.map((bf) => {
        const rows = v.frets.map((f, i) => (f === bf ? i + 1 : 0)).filter(Boolean);
        if (rows.length < 2) return null;
        return <rect key={`b${bf}`} data-dot="barre" x={dotX(bf) - 7} y={y(Math.min(...rows)) - 9} width={14} height={y(Math.max(...rows)) - y(Math.min(...rows)) + 18} rx={7} className="barre" />;
      })}
      {v?.frets.map((f, i) => {
        const s = i + 1;
        if (f < 0) return <text key={`m${s}`} data-dot="muted" x={PAD_X - 16} y={y(s) + 4} className="muted">×</text>;
        if (f === 0) return <circle key={`o${s}`} data-dot="open" cx={PAD_X - 14} cy={y(s)} r={5} className="open" />;
        return (
          <g key={`d${s}`}>
            <circle data-dot="finger" cx={dotX(f)} cy={y(s)} r={9} className="finger" />
            <text x={dotX(f)} y={y(s) + 3.5} textAnchor="middle" className="finger-num">{v.fingers[i] || ""}</text>
          </g>
        );
      })}
      {/* scale positions */}
      {target?.kind === "scale" &&
        target.positions.filter((p) => p.fret >= a && p.fret <= b).map((p) => (
          <g key={`sc${p.string}-${p.fret}`}>
            <circle data-dot={p.isRoot ? "root" : "scale"} cx={dotX(p.fret)} cy={y(p.string)} r={8} className={p.isRoot ? "root" : "scale-dot"} />
            <text x={dotX(p.fret)} y={y(p.string) + 3} textAnchor="middle" className="degree">{p.degree}</text>
          </g>
        ))}
      {/* full-tier ticks */}
      {heard?.strings?.map((st, i) => (
        <text key={`t${i}`} data-tick={st} x={W - PAD_X + 14} y={y(i + 1) + 4} className={`tick ${st}`}>
          {st === "ok" ? "✓" : st === "muted-expected" ? "–" : "·"}
        </text>
      ))}
    </svg>
  );
}
```

Add minimal classes to `apps/web/src/App.css` (`.fret-strip .fret/.nut/.string/.finger/.open/.muted/.barre/.root/.scale-dot/.degree/.finger-num/.tick`, and `.fret-strip.heard` glow) following the file's existing color-token idioms — keep it plain; the v2-UI project restyles this.

- [ ] **Step 5: Run to verify it passes** → strip tests + fretboard tests + full web suite PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(explore): schematic fretboard strip + shared windowed fret spacing"` (+ trailer).

---

### Task 7: `exploreDots()` + drawVision integration

**Files:**
- Modify: `apps/web/src/overlay/targetDots.ts` (add `label?: string` to `TargetDot`; add `exploreDots`)
- Modify: `apps/web/src/overlay/drawVision.ts` (draw explore dots when `exploreHot.target` set; filled style; no flash)
- Test: extend `apps/web/src/overlay/targetDots.test.ts`

**Interfaces:**
- Consumes: `ExploreTarget` (Task 4, type-only), existing `Homography`, `targetX`, `stringY`, `MAX_FRET`, `TargetDot`.
- Produces: `exploreDots(target: ExploreTarget, H: Homography, w: number, h: number): TargetDot[]`.

- [ ] **Step 1: Failing test** — append to `targetDots.test.ts`, reusing that file's existing homography fixture (read the file; it already builds an `H` for `targetDots` tests — use the same one):

```ts
describe("exploreDots", () => {
  const AM: ExploreTarget = {
    kind: "chord", root: "A", suffix: "minor", active: 0,
    voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
  };
  it("emits finger/open/avoid dots with number labels for the active voicing", () => {
    const dots = exploreDots(AM, H, 1280, 720);
    expect(dots.filter((d) => d.kind === "finger")).toHaveLength(3);
    expect(dots.filter((d) => d.kind === "open")).toHaveLength(2);
    expect(dots.filter((d) => d.kind === "avoid")).toHaveLength(1);
    expect(dots.find((d) => d.string === 2)?.label).toBe("1"); // B string, finger 1
  });
  it("clamps to the calibrated window: fret > MAX_FRET dots are skipped", () => {
    const up: ExploreTarget = { ...AM, voicings: [{ ...AM.voicings[0], frets: [5, 5, 5, 7, 7, 5], window: [4, 8] }] };
    const dots = exploreDots(up, H, 1280, 720);
    expect(dots.filter((d) => d.kind === "finger" && (d.fret ?? 0) > 5)).toHaveLength(0);
  });
  it("scale targets emit degree-labeled dots, window-clamped", () => {
    const sc: ExploreTarget = { kind: "scale", root: "G", scaleType: "major", positions: [
      { string: 6, fret: 3, midi: 43, note: "G2", degree: "1", isRoot: true },
      { string: 6, fret: 10, midi: 50, note: "D3", degree: "5", isRoot: false },
    ]};
    const dots = exploreDots(sc, H, 1280, 720);
    expect(dots).toHaveLength(1);
    expect(dots[0].label).toBe("1");
  });
  it("null target → no dots", () => {
    expect(exploreDots(null, H, 1280, 720)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement `exploreDots`** in `targetDots.ts` (after `targetDots()`; add `label?: string` to the `TargetDot` interface with a doc comment "explore dots: finger number or scale degree"):

```ts
/** Project an explore target (chord voicing or scale) into image-space dots.
 *  Camera calibration covers frets 0..MAX_FRET only (v1) — positions beyond
 *  it are SKIPPED here; the schematic strip is the full-neck view. */
export function exploreDots(target: ExploreTarget, H: Homography, w: number, h: number): TargetDot[] {
  if (!target) return [];
  const Hinv = invertHomography(H);
  const toXY = (x: number, y: number) => {
    const p = applyHomography(Hinv, { x, y });
    return { X: p.x * w, Y: p.y * h };
  };
  const dots: TargetDot[] = [];
  if (target.kind === "chord") {
    const v = target.voicings[target.active];
    if (!v) return [];
    v.frets.forEach((fret, i) => {
      const string = i + 1;
      if (fret > MAX_FRET) return;
      if (fret < 0) dots.push({ kind: "avoid", string, ...toXY(targetX(0), stringY(string)) });
      else if (fret === 0) dots.push({ kind: "open", string, ...toXY(targetX(0), stringY(string)) });
      else dots.push({ kind: "finger", string, fret, label: String(v.fingers[i] || ""), ...toXY(targetX(fret), stringY(string)) });
    });
    return dots;
  }
  for (const p of target.positions) {
    if (p.fret > MAX_FRET) continue;
    dots.push({ kind: "finger", string: p.string, fret: p.fret, label: p.degree, ...toXY(targetX(p.fret), stringY(p.string)) });
  }
  return dots;
}
```

Imports needed: `import { MAX_FRET } from "../perception/vision/fretboard";` and `import type { ExploreTarget } from "../explore/exploreStore";` (type-only — no runtime cycle).

- [ ] **Step 3: drawVision integration.** Read `apps/web/src/overlay/drawVision.ts` first. In the frame draw path, AFTER the existing lesson-dot block: if `fusionHot` has no active lesson AND `exploreHot.target` is non-null AND the same calibration/confidence gate the lesson dots use passes, compute `exploreDots(exploreHot.target, H, w, h)` and draw them with the existing dot-drawing helper, with two visual differences: finger dots FILLED (lesson dots are hollow rings) and the dot label text drawn from `dot.label` (falling back to the existing `fingerInitial` path for lesson dots). NO edge-flash in explore. Reuse the existing palette (`statusPalette.ts`) neutral/info color rather than R/Y/G status tints. Follow the file's existing structure — this is a small additive block, not a refactor.
- [ ] **Step 4: Run** — targetDots + overlay + full web suite PASS. `npx --yes pnpm@11.9.0 typecheck` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(overlay): project explore chord/scale dots through the calibration homography"` (+ trailer).

---

### Task 8: `ExplorePanel` + app wiring

**Files:**
- Create: `apps/web/src/explore/ExplorePanel.tsx`
- Modify: the component that renders `LessonPanel` (find with `grep -rn "LessonPanel" apps/web/src --include=*.tsx`) to add the mode toggle + panel; `apps/web/src/App.css` (minimal styles)
- Test: `apps/web/src/explore/ExplorePanel.test.tsx`

**Interfaces:**
- Consumes: everything prior. Produces: `ExplorePanel` (no props).

- [ ] **Step 1: Failing test** — `ExplorePanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../fusion/fusionStore", () => ({ stopLesson: vi.fn() }));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 },
    { frets: [5, 5, 5, 7, 7, 5], fingers: [1, 1, 1, 3, 4, 1], barres: [5], baseFret: 5, window: [4, 8], difficulty: 61 },
  ]),
  chordSuffixes: vi.fn(async () => ["major", "minor", "7"]),
}));

import { ExplorePanel } from "./ExplorePanel";
import { useExploreStore } from "./exploreStore";

describe("ExplorePanel", () => {
  it("picking a chord renders the strip with dots and a voicing pager", async () => {
    render(<ExplorePanel />);
    useExploreStore.getState().setMode("explore");
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    fireEvent.change(screen.getByTestId("explore-suffix"), { target: { value: "minor" } });
    await waitFor(() => expect(screen.getByTestId("fretboard-strip")).toBeTruthy());
    expect(screen.getByTestId("explore-voicing-label").textContent).toContain("1/2");
    fireEvent.click(screen.getByTestId("explore-voicing-next"));
    expect(screen.getByTestId("explore-voicing-label").textContent).toContain("2/2");
  });
  it("scale kind renders positions without any async load", () => {
    render(<ExplorePanel />);
    useExploreStore.getState().setMode("explore");
    fireEvent.click(screen.getByTestId("explore-kind-scale"));
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "G" } });
    expect(screen.getByTestId("fretboard-strip")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement** — `ExplorePanel.tsx`: native selects/buttons in the codebase's existing panel idiom (`className="audio-debug"` section style), testids exactly as in the test (`explore-root`, `explore-suffix`, `explore-kind-scale`, `explore-kind-chord`, `explore-voicing-next`, `explore-voicing-prev`, `explore-voicing-label`, `explore-tier`), the tier switch showing the resolved value (e.g. `auto → light (mic)` via `currentResolvedTier()`), `FretboardStrip` fed from the store, `loadError` line when set ("chord library unavailable — retry" + retry button re-calling `setChord`). Suffix options come from `chordSuffixes()` loaded on mount (fallback to `["major","minor"]` on failure). Kind toggle default: chord. Roots from `CHORD_ROOTS`.
- [ ] **Step 3: Mode toggle wiring.** Where `LessonPanel` renders, add a two-button `Practice | Explore` toggle (testids `mode-practice`, `mode-explore`) driving `useExploreStore.setMode`, rendering `LessonPanel` in practice mode and `ExplorePanel` in explore mode. Everything about practice mode's tree stays exactly as-is.
- [ ] **Step 4: Run** — panel tests + FULL suite + `typecheck` + `lint` PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(explore): explore panel + practice/explore mode toggle"` (+ trailer).

---

### Task 9: e2e scenario + gates

**Files:**
- Create: `apps/web/e2e/explore.spec.ts`
- Test: itself.

**Interfaces:** consumes the testids from Task 8.

- [ ] **Step 1: Read one existing spec** (`apps/web/e2e/fusion-lesson.spec.ts`) and copy its launch/setup helper usage exactly (fake devices, capture start, canned calibration helper if it exposes one).
- [ ] **Step 2: Write the spec:**

```ts
import { expect, test } from "@playwright/test";
// Mirror fusion-lesson.spec.ts's beforeEach/app-boot helpers verbatim.

test("explore mode: Am voicing renders on the strip; camera dots draw when calibrated", async ({ page }) => {
  // boot app (same helper as fusion-lesson.spec.ts)
  await page.getByTestId("mode-explore").click();
  await page.getByTestId("explore-root").selectOption("A");
  await page.getByTestId("explore-suffix").selectOption("minor");
  const strip = page.getByTestId("fretboard-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator("[data-dot='finger']")).toHaveCount(3);
  await expect(strip.locator("[data-dot='open']")).toHaveCount(2);
  // Camera overlay: if the suite has a calibration fixture (fusion-lesson uses
  // one to get target dots drawn), apply it and assert the overlay canvas draws
  // (reuse whatever assertion fusion-lesson.spec.ts uses for lesson dots —
  // e.g. a __overlayDebug hook or pixel sample). If no reusable calibration
  // helper exists, assert instead that NO dots/nudge appear uncalibrated
  // (ADR-007) and note it in the report.
  // Switching back to practice restores the lesson panel.
  await page.getByTestId("mode-practice").click();
  await expect(page.getByTestId("mode-explore")).toBeVisible();
});
```

- [ ] **Step 3: Run everything** — the release gate set, all green:

```bash
npx --yes pnpm@11.9.0 typecheck && npx --yes pnpm@11.9.0 --filter ./apps/web lint
npx --yes pnpm@11.9.0 --filter ./apps/web test
npx --yes pnpm@11.9.0 build && npx --yes pnpm@11.9.0 bundle-size && npx --yes pnpm@11.9.0 license-check
npx --yes pnpm@11.9.0 --filter ./apps/web e2e
npx --yes pnpm@11.9.0 --filter ./apps/web e2e:dev
```

Expected: bundle-size initial ≈ unchanged (~122 KB gz) with chords-db in the deferred list; all suites green.

- [ ] **Step 4: Commit** — `git commit -m "test(e2e): explore mode scenario + gate run"` (+ trailer).

---

## Plan self-review record

- Spec coverage: §3.1→T1, §3.2→T2, §3.3→T3, §4→T4, §5.1→T6, §5.2→T7, §6→T5, §7→T8, §8 edges→T4/T5/T6/T8 tests, §9→each task + T9, §10 untouched (follow-ups).
- Known deliberate openness (not placeholders): T3 probes the real chords-db shape before pinning it; T5 greps the real audio-event shapes before matching them; T9 mirrors the existing e2e boot helpers. Each carries exact discovery commands and a report-back requirement.
- Type consistency pass done: `Voicing`, `ExploreTarget`, `HeardState`, `fretX`, testids match across tasks.
