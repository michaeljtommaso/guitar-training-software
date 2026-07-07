# Explore Mode v1 — Design Spec

> Status: approved-pending-owner-review · 2026-07-07
> Brainstormed with owner; decisions below are locked unless marked follow-up.
> Companion docs: `docs/research/Fretboard Visualization  Deep Research & Gap Analysis.md`
> (source research), `guitar-software-ui/Practice Prototype v2.dc.html` (target UI,
> implemented later — v1 chrome is deliberately thin).

## 1. Summary

Explore mode is a reference + light-practice surface: pick any chord (all voicings)
or any key/scale and see it rendered on (a) a schematic SVG fretboard strip that
works with zero camera, and (b) the live camera overlay when capture is running and
calibrated. It listens optionally — feedback depth keys off input quality (mic →
chord-level "light", direct input → per-string "full") with a manual override.
It never generates diagnoses, hints, or coaching.

### Locked decisions (owner)
1. **Scope:** chords + scales in v1. CAGED/position boxes are v2.
2. **Camera:** standalone-first — strip always works; camera overlay is additive
   when calibrated.
3. **Feedback:** `auto | light | full` switcher; auto derives from
   `classifyAudioInput` (interface → full, mic/unknown → light).

### Non-goals (v1)
- No CAGED/TNPS box filtering, no capo support, no alternate tunings.
- No static `react-chords` side-panel diagram (the strip covers it).
- No vision-leg evidence in explore feedback (audio-only; vision follow-up).
- No coaching/diagnosis/hint machinery — explore never touches `FusionEngine`.
- No calibration extension past `MAX_FRET = 5` (camera dots outside the window
  are skipped; the strip shows everything).

## 2. Architecture

```
@tombatossals/chords-db (lazy)      pure math
        │                              │
   theory/chords.ts             theory/scales.ts     theory/notes.ts
        └──────────────┬───────────────┘
                       ▼
             explore/exploreStore.ts  (zustand + hot ref, mirrors captureStore pattern)
              │                │                 │
              ▼                ▼                 ▼
   explore/FretboardStrip  overlay/targetDots   explore/feedback.ts
   (SVG, no camera)        exploreDots()        (light/full tiers, audio events)
                           → drawVision.ts
```

New directories: `apps/web/src/theory/`, `apps/web/src/explore/`.
Touched existing files: `overlay/targetDots.ts`, `overlay/drawVision.ts` (+ its
hot-state read), `capture/controller.ts` (one tap: forward audio events to explore
ingest), `App.tsx`/panel wiring, `App.css` (minimal).

## 3. Theory layer — `apps/web/src/theory/`

Pure modules. No React, no stores, no side effects. Everything unit-tested.

### 3.1 `notes.ts`
```ts
export const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40] as const;
// index 0 = string 1 (high e) … index 5 = string 6 (low E) — PROJECT STANDARD
// numbering (1 = high e … 6 = low E, unified in commit cc42d15). Everything in
// theory/ and explore/ uses this convention; converters from external data are
// the ONLY place the other convention may appear.

export type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11;   // C=0 … B=11
export function noteToPc(name: string): PitchClass;     // "C#"/"Db" → 1; throws on garbage
export function pcToName(pc: number, prefFlat?: boolean): string;
export function midiToName(midi: number): string;       // 40 → "E2"
export function midiPc(midi: number): PitchClass;
```

### 3.2 `scales.ts`
```ts
export type ScaleType = "major" | "minor" | "pentatonic_major" | "pentatonic_minor" | "blues";

export interface ScalePosition {
  string: number;   // 1..6
  fret: number;     // 0..maxFret
  midi: number;
  note: string;     // "G3"
  degree: string;   // "1","2","♭3","4","5","♭7"… relative to the scale's own spelling
  isRoot: boolean;
}

export function scalePositions(
  root: string, type: ScaleType, opts?: { maxFret?: number },  // default maxFret 12
): ScalePosition[];
```
Interval sets (semitones from root) and degree labels:
- major `[0,2,4,5,7,9,11]` → `1 2 3 4 5 6 7`
- minor `[0,2,3,5,7,8,10]` → `1 2 ♭3 4 5 ♭6 ♭7`
- pentatonic_major `[0,2,4,7,9]` → `1 2 3 5 6`
- pentatonic_minor `[0,3,5,7,10]` → `1 ♭3 4 5 ♭7`
- blues `[0,3,5,6,7,10]` → `1 ♭3 4 ♭5 5 ♭7`

Implementation is the obvious double loop over strings × frets filtered by
`(midi - rootPc) % 12 ∈ intervals`. Return sorted by string then fret.

### 3.3 `chords.ts` — chords-db adapter
```ts
export interface Voicing {
  /** Per-string ABSOLUTE fret, index 0 = string 1 (high e) … 5 = string 6 (low E).
   *  -1 = muted, 0 = open. */
  frets: number[];
  /** Per-string finger 0..4 (0 = none), same indexing. */
  fingers: number[];
  /** Barres as ABSOLUTE fret numbers (chords-db gives them relative). */
  barres: number[];
  baseFret: number;          // 1 = open position; >1 = up the neck
  /** Display window hint for the strip: [startFret, endFret]. */
  window: [number, number];
  difficulty: number;        // sort key, lower = easier (see below)
}

export async function chordVoicings(root: string, suffix: string): Promise<Voicing[]>;
export async function chordSuffixes(): Promise<string[]>;   // from db metadata
export const CHORD_ROOTS: string[];                          // C, C#, D … B (db keys)
```
**Data conversion — the part that MUST be test-pinned:**
- chords-db positions carry `frets`/`fingers` ordered **low E → high e**; we
  REVERSE into project order (string 1 = high e first). An explicit unit test
  asserts a known voicing (e.g. C major open: db `[x,3,2,0,1,0]` low-E-first →
  ours `[0,1,0,2,3,-1]` high-e-first).
- db `frets` are RELATIVE to `baseFret` when `baseFret > 1`
  (absolute = fret + baseFret − 1 for fret > 0; 0 stays open only when baseFret
  is 1 — chords-db does not emit open strings on shifted shapes, assert this).
  `barres` likewise shifted to absolute.
- `difficulty` heuristic: `baseFret*10 + barres.length*5 + countFingers` —
  open-position voicings sort first. Pin with a test: Am's first voicing is the
  open shape.
- **Lazy loading:** `import("@tombatossals/chords-db/lib/guitar.json")` (exact
  entry point to be confirmed at implementation against the installed package)
  behind a memoized loader. It must land in a deferred chunk — `pnpm bundle-size`
  initial budget (250 KB gz) is a hard gate. License: MIT (firewall-clean); add
  the package normally so `license-check` sees it.
- **Why not lesson `Fingering`:** `fusion/lessons.Fingering` maps one finger →
  one `{string, fret}` and cannot represent a barre (one finger, many strings).
  `Voicing` is explore's own type; nothing in fusion/lessons changes.

## 4. State — `apps/web/src/explore/exploreStore.ts`

Zustand store + module-level hot ref (same pattern as `captureStore`/`fusionHot`;
the overlay frame callback must read without React).

```ts
export type ExploreTarget =
  | { kind: "chord"; root: string; suffix: string; voicings: Voicing[]; active: number }
  | { kind: "scale"; root: string; scaleType: ScaleType; positions: ScalePosition[] }
  | null;

export type FeedbackTier = "auto" | "light" | "full";

interface ExploreState {
  mode: "practice" | "explore";
  target: ExploreTarget;
  tier: FeedbackTier;
  resolvedTier: "light" | "full";       // auto resolved against current input kind
  heard: HeardState;                    // see §6
  setMode(m): void; setChord(root, suffix): Promise<void>;
  setScale(root, type): void; setVoicing(i): void; setTier(t): void;
}
export const exploreHot: { target: ExploreTarget; heard: HeardState };  // frame-loop read
```
Rules:
- `setMode("explore")` calls `fusion/fusionStore.stopLesson()` if a lesson is
  active. Practice and explore targets are never live simultaneously.
- `setMode("practice")` clears `exploreHot.target` (overlay stops drawing explore
  dots on the next frame).
- `resolvedTier`: `tier === "auto"` → `classifyAudioInput(currentMicLabel) ===
  "interface" ? "full" : "light"`; recomputed when tier or mic changes.

## 5. Renderers

### 5.1 `explore/FretboardStrip.tsx` — schematic SVG (no camera)
Horizontal strip mirroring Practice Prototype v2's "fretboard zoom" panel: nut +
fret lines (x positions from `fretboard.ts` spacing math re-scaled to the widget's
fret window — reuse `fretLineX`-style equal-tempered spacing, NOT a copy of the
formula), 6 string lines (string 1/high-e on TOP, matching the prototype),
left-edge markers: open circle (`0`) and muted `×` at the nut.

Props:
```ts
interface FretboardStripProps {
  target: ExploreTarget;               // what to draw
  window?: [number, number];           // fret window; default: voicing.window or [0, 12] for scales
  heard?: HeardState;                  // tier feedback → per-string ticks / glow
}
```
- Chord mode: numbered finger dots (1–4) at `targetX`-equivalent positions
  (70%-behind-the-fret convention, same as lessons); barres drawn as a rounded
  bar spanning the barred strings; open/muted markers at the nut edge; per-string
  ✓/—/· ticks on the right edge (full tier) or a whole-strip "heard ✓" glow
  (light tier).
- Scale mode: dots on every position in the window; roots filled, others hollow,
  degree text inside; window defaults to `[0, 12]` with a simple prev/next
  window pager when content overflows (no drag/pan in v1).
- Pure presentational: no store reads inside — parent passes state (testable by
  rendering with fixture props and asserting SVG node positions).

### 5.2 Camera overlay — `exploreDots()` in `overlay/targetDots.ts`
```ts
export function exploreDots(target: ExploreTarget, H: Homography, w: number, h: number): TargetDot[];
```
- Reuses `invertHomography`/`applyHomography`/`targetX`/`stringY` exactly like
  `targetDots()`. Emits existing `TargetDot`s: `kind: "finger"` dots labeled by
  finger NUMBER (1–4; `fingerInitial` gains digit passthrough or dots carry a
  `label` — implementer picks the smaller diff, test-pinned), `open`/`avoid`
  markers as today. Scale positions emit `finger`-kind dots labeled with degree.
- **Window clamp:** positions with `fret > MAX_FRET` are skipped (calibration
  only covers the open window). The strip is the full-neck view; the camera is
  not, in v1.
- `drawVision.ts`: when `exploreHot.target` is set (and fusion inactive by the
  §4 rules), draw explore dots with the same confidence/calibration gating as
  lesson dots (ADR-007: no calibration → no dots, ever). Visual distinction:
  explore finger dots render FILLED (learning placement) vs lessons' hollow
  status rings; no red/green flash in explore.

## 6. Feedback — `explore/feedback.ts`

Audio-only in v1. A small pure reducer fed by the same audio events the fusion
store ingests; `capture/controller.ts` adds one line next to its existing
`fusionIngest(events, "audio")` call: `exploreIngest(events)` (no-op unless mode
is explore — the check lives inside explore, controller stays dumb).

```ts
export interface HeardState {
  /** light tier: explored chord heard right now (label match, conf ≥ LIGHT_CONF, within HOLD_MS). */
  chordHeard: boolean;
  /** full tier: per string 1..6 → "ok" | "pending" | "muted-expected". */
  strings?: Array<"ok" | "pending" | "muted-expected">;
}
```
- **Light:** chord events with `label === target chord name` (db name mapped to
  the 8-template label space where they overlap; outside that space — e.g. C#m7 —
  light tier shows "listening n/a" honestly, since the template matcher only
  knows 8 open chords + silence/noise in v1) and `conf ≥ LIGHT_CONF (0.5)` set
  `chordHeard = true` for `HOLD_MS (1500)`.
- **Full:** notes events (Basic Pitch midi stream, working post-BUG-003) matched
  per string: expected midi per string = `STANDARD_TUNING_MIDI[s-1] + absFret`;
  a note within ±1 semitone of the expected midi marks that string "ok" for
  `HOLD_MS`; strings with `frets[s-1] === -1` are "muted-expected" (no negative
  evidence in v1 — we mark expectations, we don't accuse). Scales in full tier:
  light up individual positions as their pitches are heard (same midi matching,
  octave-agnostic fallback by pitch class if exact-octave proves flaky —
  implementer decides from real behavior, decision recorded in code comment).
- Constants (`LIGHT_CONF`, `HOLD_MS`, semitone tolerance) are named exports with
  doc comments — same tuning-friendly convention as `SILENCE_RMS`.
- Degrades gracefully: no notes events → full tier renders like light plus
  "pending" ticks; silence-gated frames (BUG-001 gates) simply produce no events.

## 7. UI (v1-thin, reskinned during the v2 UI implementation)

`explore/ExplorePanel.tsx`, mounted alongside `LessonPanel`:
- Mode toggle: `Practice | Explore` (drives `exploreStore.mode`; Practice is
  today's behavior, untouched).
- Explore controls: kind toggle (Chord | Scale); root `<select>` (12 roots);
  suffix `<select>` (chords; from `chordSuffixes()`, common ones first: major,
  minor, 7, m7, maj7, sus2, sus4…) or scale-type `<select>`; voicing pager
  `‹ voicing 2/5 ›` (chords only); tier switch `auto | light | full` with the
  resolved tier shown (e.g. "auto → light (mic)").
- `FretboardStrip` renders below the camera area (prototype position).
- Native inputs, existing `App.css` idioms, no new styling system. All chrome is
  expected to be replaced in the v2-UI project; the strip itself is keeper code.

## 8. Error handling & edges

- chords-db chunk fails to load (offline first run before cache): panel shows
  "chord library unavailable — retry"; scales (pure math) still work.
- Unknown root/suffix lookup → empty voicing list → panel shows "no voicings";
  never throws into React.
- Voicing index clamped when switching chords (active resets to 0).
- Calibration absent in explore + capture running → strip works; camera shows the
  existing "calibrate" nudge only in practice mode (explore adds no new nudges).
- Mode switch mid-lesson: `stopLesson()` first (session log closes normally).

## 9. Testing

| Layer | Tests |
|---|---|
| `theory/notes` | name↔pc↔midi round-trips, enharmonics, throws on garbage |
| `theory/scales` | G major full-neck positions vs hand-computed fixture; A-minor-pentatonic positions vs hand-computed fixture (exact set, frets 0–12); degree labels incl. ♭ cases; roots flagged |
| `theory/chords` | **string-order reversal pinned** (C major fixture); baseFret absolute-fret math (e.g. C#m @ baseFret 4); barre absolutization; difficulty ordering (Am open first); lazy loader memoizes |
| `exploreStore` | mode transitions stop lessons; hot ref mirrors state; auto-tier resolution vs input kind |
| `feedback` | light: label+conf+hold window; full: per-string midi matching incl. muted-expected; graceful no-notes degradation |
| `FretboardStrip` | render fixtures → assert dot cx/cy per fret window; barre bar span; root filled vs hollow |
| `exploreDots` | reuse existing homography fixtures from `targetDots.test.ts`; MAX_FRET clamp asserted |
| e2e | one scenario: switch to Explore, pick Am → strip renders expected dot count; with fake capture + canned calibration, overlay draws explore dots (mirrors `fusion-lesson.spec.ts` structure) |
| Gates | `pnpm bundle-size` (chords-db must be a deferred chunk), `pnpm license-check` (MIT), full suite + e2e green |

## 10. Follow-ups (logged, not v1)

1. CAGED/TNPS box filtering on the scale view (v2 of explore).
2. Extend calibration/geometry past `MAX_FRET = 5` → full-neck camera dots.
3. Vision-leg evidence in full-tier feedback (finger position vs voicing).
4. Chord-detector coverage beyond the 8 open templates (Q-04 CRNN lane) — will
   automatically widen light-tier coverage.
5. Strip pan/drag gesture + zoom (v2 UI project decides interaction).
6. Capo + alternate tunings (theory layer params are shaped to allow it).
