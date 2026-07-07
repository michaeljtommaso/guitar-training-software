# Fretboard Visualization: Deep Research & Gap Analysis

## Executive Summary

The guitar-training-software repo already contains a sophisticated, correct visual pipeline: a homography-calibrated live-video overlay, MediaPipe hand tracking, target-dot projection, and per-string status bars. However, the chord/key teaching mode is almost entirely absent — `targetDots.ts` only projects the *current lesson step's canonical fingering*, with no concept of "show me all positions for G major" or "show me every voicing of Am." Competitor apps like Yousician, ChordSight, and Fretboard.js have solved different slices of this problem, and a rich ecosystem of MIT-licensed open-source libraries can be integrated directly into the React front end. The zoom/crop feature for focusing on the active fret region is purely a canvas operation requiring no new dependencies.

***

## What the Codebase Has Today

### Geometry Layer (Strong)

`fretboard.ts` defines a rigorous normalized coordinate space: `x ∈ [0,1]` runs nut→fret along equal-tempered spacing using \( 1 - 2^{-n/12} \), and `y ∈ [0,1]` runs string-6 to string-1. `MAX_FRET` is currently `5` (open-chord MVP window). `targetX()` in `targetDots.ts` places a pressed-finger dot at 70% of the way from fret line n-1 to fret line n — the standard "just behind the fret wire" pedagogical position. This is the correct convention used by every reference app.

### Overlay Rendering (Strong)

`drawVision.ts` runs on the main thread and paints over the `<video>` element. It draws:
- A projected fret grid from the **inverted homography** (`Hinv = invertHomography(H)`)
- Hollow ring target dots colored by per-string status (R/Y/G)
- Filled halos on detected fingertips from MediaPipe landmarks
- Six per-string status bars in the top-right corner
- A confidence-gated full-canvas edge glow flash (red = wrong, green = correct)

The `globalAlpha` is driven by `overlayOpacity(decayConfidence(...))`, so the overlay gracefully dims if the calibration marker is lost.

### Target Dot Logic (Thin)

`planTargets()` in `targetDots.ts` accepts one `FusionTarget` — a single lesson-step fingering — and projects it. There is **no chord database lookup**, **no key/scale dot generator**, and **no multi-voicing awareness**. The dots only appear when a lesson is actively running (`fusionHot.active === true`). The coach system (`templateCoach.ts`) serves the fingerings, but there is no standalone "explore a chord" or "explore a key" mode outside an active lesson.

### Zoom / Viewport (Missing)

There is no zoom, pan, or region-crop anywhere in the visual pipeline. `OverlayCanvas.tsx` fills the video feed at full resolution. No `drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh)` crop is wired up.

***

## How Competitor Apps Do It

### Yousician

Yousician uses a **static SVG fretboard diagram** rendered alongside the scrolling tab lane, not AR-projected onto camera. In "standard & fret" notation mode, it highlights the target note's fret dot in real time as the song plays. Chord diagrams in the chord library show standard box diagrams (nut at top, six strings, dots per fret) with optional alternative voicings by swiping. There is **no live camera projection** — feedback is audio-only via microphone pitch detection. The pedagogical overlay is a UI widget, not a homography projection.[^1][^2]

**Key takeaway:** Yousician proves users learn effectively from *both* a static diagram panel *and* real-time audio feedback, without needing camera AR. A side-by-side or picture-in-picture static diagram is a valid fallback when calibration is unavailable.

### ChordSight (Hackathon, 2025)

ChordSight uses OpenCV + a custom-trained CV model (React frontend, FastAPI backend) to detect fretboard corners, then overlays chord positions as dots on a live webcam feed. The approach is architecturally similar to the existing codebase but uses a Python backend for the heavy CV. The limitation is latency across the FastAPI bridge and the brittleness of a custom-trained detector vs. the ArUco/homography approach already in `opencvCalib.ts`.[^3]

**Key takeaway:** Your homography approach is more robust than ChordSight's end-to-end approach — no model to train, no network round trip.

### GuitarTuna / Ultimate Guitar

GuitarTuna's "Chords" tab shows **SVG box diagrams** with filled circles for each finger and open/muted string indicators — purely static, no camera. Ultimate Guitar uses the same convention. Neither projects onto live video.[^4]

***

## Open-Source Libraries to Integrate

### Chord Database: `tombatossals/chords-db` (MIT)

The most complete freely licensed chord database for guitar. Contains **3,283 guitar chord voicings** in a JSON structure:[^5]

```json
{
  "frets": [1, 3, 3, 2, 1, 1],   // -1 = muted, 0 = open
  "fingers": [1, 3, 4, 2, 1, 1], // 0 = no finger (open/muted)
  "barres": [^1],
  "capo": false,
  "baseFret": 1
}
```

This maps **directly** to your `Fingering` type in `targetDots.ts`. The `frets` array is the `fret` field per string; `fingers` maps to your `index/middle/ring/pinky` names. Install via `npm install @tombatossals/chords-db`.

A secondary option is `szaza/guitar-chords-db-json` (99,230 voicings, MIT) — too large to ship client-side but useful for a server-side chord lookup API on your Hermes VPS.[^6]

### Fretboard Visualization: `@moonwave99/fretboard.js` (MIT)

The best TypeScript SVG fretboard library on npm. Supports:[^7][^8]
- **Scale/key visualization:** `FretboardSystem.getScale({ type: 'major', root: 'G' })` returns all `{string, fret, note}` positions across the full neck
- **CAGED and TNPS box filtering:** pass `{ box: 'CAGED' }` to get positional subsets
- **Chord shape rendering:** directly accepts `{string, fret, finger}` arrays
- **Custom dot labels:** note name, interval, or fingering number
- **Configurable fret window:** `fretCount`, `startFret` for a windowed view

This is directly composable with `planTargets()` — generate the `TargetDot[]` array from `fretboard.js` positions, then run them through your existing `invertHomography` projection.

### React Chord Diagrams: `tombatossals/react-chords` (MIT)

Renders a standard SVG box diagram from a `{frets, fingers, barres}` object. The component is useful for the **side panel** (static reference) mode while the camera overlay projects onto the live fretboard. Accepts the exact shape from `chords-db`.[^9]

### Scales Data: Direct Calculation vs. Library

For key/scale dots, **direct calculation is preferable to a JSON database** because the pattern is formulaic. A 12-tone chromatic scale on a guitar in standard tuning is fully deterministic. Pseudo-code:

```ts
function scalePositions(root: string, intervals: number[], maxFret = 12): {string: number, fret: number, note: string}[] {
  const STANDARD = [40, 45, 50, 55, 59, 64]; // MIDI note numbers for open strings E A D G B e
  const rootMidi = noteToMidi(root); // e.g. 'G' → 43 or 55 etc.
  return STANDARD.flatMap((openMidi, idx) => {
    const string = idx + 1;
    return Array.from({length: maxFret + 1}, (_, fret) => ({string, fret, midi: openMidi + fret}))
      .filter(p => intervals.includes((p.midi - rootMidi + 120) % 12))
      .map(p => ({string: p.string, fret: p.fret, note: midiToNote(p.midi)}));
  });
}
```

`@moonwave99/fretboard.js` wraps this exact logic in `FretboardSystem`, so using the library is cleaner than re-implementing it.[^8]

***

## The Zoom / Crop Feature

### How It Works

The Canvas 2D API's `drawImage()` 9-argument form is the native mechanism:[^10]

```js
ctx.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
```

- `sx, sy, sWidth, sHeight` — the **source rectangle** to crop from the live video frame
- `dx, dy, dWidth, dHeight` — the **destination rectangle** on the display canvas

To zoom into the active fret region around a detected chord, the pipeline is:

1. **Compute the bounding box in image space.** The `targetDots` array already carries `{X, Y}` pixel positions. Take `minX - padding, minY - padding, maxX + padding, maxY + padding` as the source crop.
2. **Map to the video's natural resolution.** The video element exposes `videoWidth` and `videoHeight` (intrinsic pixels), while CSS may display it at a different size. Scale the crop rectangle by `videoWidth / displayedWidth`.[^10]
3. **Render to a secondary "zoom" canvas.** The zoom canvas lives below or beside the main overlay, sized to a fixed panel (e.g. 320×240px). The `drawImage` call crops and upscales in one step.

```ts
function drawZoomRegion(
  zoomCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dots: TargetDot[],
  padding = 40,
) {
  if (!dots.length) return;
  const xs = dots.map(d => d.X), ys = dots.map(d => d.Y);
  const scaleX = video.videoWidth / video.offsetWidth;
  const scaleY = video.videoHeight / video.offsetHeight;
  const sx = (Math.min(...xs) - padding) * scaleX;
  const sy = (Math.min(...ys) - padding) * scaleY;
  const sw = (Math.max(...xs) - Math.min(...xs) + 2 * padding) * scaleX;
  const sh = (Math.max(...ys) - Math.min(...ys) + 2 * padding) * scaleY;
  zoomCtx.drawImage(video, sx, sy, sw, sh, 0, 0, zoomCtx.canvas.width, zoomCtx.canvas.height);
  // Re-draw overlay dots on the zoom canvas with adjusted coordinates
}
```

The overlay dots then need to be **re-projected** into the zoom canvas coordinate space: `zoomX = (dot.X - sx/scaleX) / sw * scaleX * zoomCanvas.width` etc. This is straightforward linear mapping.

### CSS Transform Alternative (Simpler)

For a purely visual zoom without re-rendering, CSS `transform: scale(Z) translate(...)` on a `<div>` wrapping both the `<video>` and `anvas>` achieves the same effect. The approach in `zoompan` and the Canvas pan/zoom patterns use `transform-origin` plus `translate` to keep the zoom centered on the cursor or on a target element. This requires no changes to the drawing code — it's a CSS layer applied on top — but the zoom canvas may appear pixelated above ~2× on low-res webcams.[^11][^12][^13]

The `drawImage` crop approach is **sharper** for the zoom inset because it accesses the full-resolution video pixels rather than scaling up an already-displayed canvas.

***

## Architecture Plan: Adding Chord/Key Mode

### New Data Types Needed

```ts
// Proposed: apps/web/src/theory/types.ts
export type ChordTarget = {
  kind: 'chord';
  name: string;          // e.g. "Am"
  voicings: Voicing[];   // from chords-db, ordered by difficulty
  activeVoicing: number; // index into voicings
};

export type KeyTarget = {
  kind: 'key';
  root: string;          // e.g. "G"
  scale: 'major' | 'minor' | 'pentatonic_major' | 'pentatonic_minor' | string;
  positions: ScalePosition[]; // {string, fret, note, degree}
  highlightBox?: 'CAGED' | 'TNPS' | null;
};

export type ExploreTarget = ChordTarget | KeyTarget | null;
```

### Integration Points

| Current Module | Change Needed |
|---|---|
| `targetDots.ts` | Add `chordDots(voicing, H, w, h)` and `keyDots(positions, H, w, h)` alongside existing `targetDots()` |
| `drawVision.ts` | Branch on `ExploreTarget.kind` to call the right dot generator; for key mode, draw ALL scale positions with colored degree labels (root = filled, others = hollow) |
| `fusionStore.ts` | Add `exploreTarget: ExploreTarget` to `fusionHot` so the overlay frame callback can access it without React re-renders |
| `CoachPanel.tsx` | Add "Explore" tab with chord picker and key/scale picker UI |
| New: `theory/chords.ts` | Thin adapter: `chords-db` JSON → `Fingering` type used by `targetDots.ts`; voicing sorter by difficulty |
| New: `theory/scales.ts` | Pure function: `scalePositions(root, scaleType, fretWindow)` returning `{string, fret, note, degree}[]` |

### Chord Mode Visual Behavior

For chord mode, the overlay should show:
1. **Filled colored dots** at each fingered fret (unlike the current hollow-ring "target" style which assumes a lesson is running). A filled dot = "put your finger here to learn."
2. **Open circle at the nut** for open strings that should ring.
3. **X mark** for muted strings.
4. **Finger number** (I/M/R/P) inside each dot, from the `fingers` array in chords-db.
5. **Voicing switcher**: swipe/arrow to cycle through the 3–8 voicings available per chord.

The color scheme can reuse `statusPalette.ts` — map finger number to a consistent color (index = blue, middle = green, ring = orange, pinky = purple) rather than the R/Y/G lesson-status colors.

### Key/Scale Mode Visual Behavior

For key mode, ALL positions across the fretboard should be shown simultaneously, unlike chord mode which is one shape:
1. **Root note dots** — filled, colored (e.g. blue), labeled with the note name.
2. **Other scale-tone dots** — hollow, labeled with scale degree (2, 3, 4… or ♭7 etc.).
3. **CAGED box filter toggle** — dim out-of-box dots to 20% opacity, show in-box dots at full opacity. This is the single most requested feature for fretboard learning apps.[^14]
4. **Scroll/pan** — since `MAX_FRET = 5` currently, a "show full neck" mode needs to either extend the fret window or add a horizontal pan gesture.

### Static Panel + AR Overlay (Dual Mode)

Yousician's research shows that a static diagram aids pattern memorization even for users doing live feedback. The recommended architecture is:[^1]

- **Left panel (or overlay):** `react-chords` or `fretboard.js` SVG diagram showing the "booklet" view (vertical fretboard, nut at top).
- **Right panel / full-screen:** live camera with dots projected via `targetDots`/`chordDots`/`keyDots`.
- The two panels sync: tapping a chord name updates both simultaneously.

***

## Gap Analysis: Current vs. Target

| Feature | Current State | What's Missing |
|---|---|---|
| Single-chord lesson dots | ✅ Working via `planTargets` + `FusionTarget` | — |
| Chord explore (no active lesson) | ❌ Not implemented | `ExploreTarget`, `chordDots()`, chord DB |
| Multiple voicings per chord | ❌ Not implemented | Voicing picker, chords-db integration |
| Key/scale overlay (all positions) | ❌ Not implemented | `scalePositions()`, key dots renderer |
| CAGED/TNPS box filtering | ❌ Not implemented | Box filter in scale dot renderer |
| Full-neck fret window (>fret 5) | ❌ `MAX_FRET = 5` hardcoded | Dynamic `MAX_FRET` or sliding window |
| Zoom into active finger region | ❌ Not implemented | Secondary canvas + `drawImage` crop |
| Static side-panel chord diagram | ❌ Not implemented | `react-chords` component |
| Finger-to-color mapping | Partial (R/Y/G status only) | Per-finger consistent color scheme |
| Muted-string "X" at nut | ✅ `kind: "avoid"` exists | Already works, needs chord DB wiring |
| Open-string circle | ✅ `kind: "open"` exists | Already works |

***

## Recommended Build Order

1. **`theory/scales.ts`** — pure function, no UI, zero dependencies. Covers key mode data.
2. **Install `@tombatossals/chords-db`** and write `theory/chords.ts` adapter to map voicings to `Fingering`. This is a one-file addition.
3. **Add `ExploreTarget` to `fusionHot`** — single-line store change that unlocks both chord and key modes.
4. **Extend `drawVision.ts`** with `drawChordDots()` and `drawKeyDots()` — these reuse all existing geometry helpers (`invertHomography`, `applyHomography`, `fretLineX`, `stringY`).
5. **Add "Explore" tab to `CoachPanel.tsx`** with chord picker (root + type dropdowns) and key picker.
6. **Implement zoom canvas** as a small `anvas>` in the top-right corner that activates when calibrated and an explore target is set.
7. **Add `react-chords` static diagram** as a reference panel alongside the camera view.

The entire feature set from steps 1–5 can be built without touching the audio pipeline, the homography calibration, or the MediaPipe worker — the geometry layer is already the right foundation.

***

## Open-Source Library Reference

| Library | License | Use Case | npm |
|---|---|---|---|
| `@tombatossals/chords-db` | MIT[^5] | 3,283 guitar voicings JSON | `chords-db` |
| `tombatossals/react-chords` | MIT[^9] | SVG chord box diagram React component | `@tombatossals/react-chords` |
| `@moonwave99/fretboard.js` | MIT[^7][^8] | Full SVG fretboard + scale/CAGED engine | `@moonwave99/fretboard.js` |
| `szaza/guitar-chords-db-json` | MIT[^6] | 99k voicings for server-side lookup | GitHub only |
| `hoxas/ScaleTool` (reference) | MIT[^15] | React scale + chord visualizer, study the impl | GitHub |
| `cube-dan/fretboard-svg` | MIT[^16] | D3-based all-positions scale viewer | GitHub |

---

## References

1. [Tools tab](https://support.yousician.com/hc/en-us/articles/4419296622993-Tools-tab) - Tools tab includes a metronome, chord library and minigames you can use to learn to play chords. Met...

2. [Yousician How-to: Changing Notation](https://www.youtube.com/watch?v=AjcKdhFd8OI) - In this video, we're going to review the different types of notation options in Yousician and how to...

3. [ChordSight](https://devpost.com/software/chordsight) - Our app uses your webcam to track finger placement on the guitar fretboard, giving real-time feedbac...

4. [Fretboard | npm.io](https://npm.io/search/keyword:fretboard) - @authentrics/ngx-chord-diagram, @moonwave99/fretboard.js, fretboards, chord-fingering, chordictionar...

5. [tombatossals/chords-db: String Instruments Chords Database. · GitHub](https://github.com/tombatossals/chords-db) - A javascript database of string instruments chords. Open, free to use, easily improved with more cho...

6. [GitHub - szaza/guitar-chords-db-json: Collection of guitar chords in JSON format.](https://github.com/szaza/guitar-chords-db-json) - Collection of guitar chords in JSON format. Contribute to szaza/guitar-chords-db-json development by...

7. [Fretboard.js - MWLabs/dev.](https://moonwave99.github.io/fretboard.js/)

8. [Documentation - Music Tools](https://moonwave99.github.io/fretboard.js/documentation-music-tools.html)

9. [GitHub - tombatossals/react-chords: React library for easily generate guitar/ukulele SVG chords](https://github.com/tombatossals/react-chords) - React library for easily generate guitar/ukulele SVG chords - tombatossals/react-chords

10. [CanvasRenderingContext2D: drawImage() method - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) - The CanvasRenderingContext2D.drawImage() method of the Canvas 2D API provides different ways to draw...

11. [Infinite Canvas with Panning and Zooming](https://gist.github.com/senecafron/bc6c9ff220641306c77ec9c2a6a1675f) - Infinite Canvas with Panning and Zooming. GitHub Gist: instantly share code, notes, and snippets.

12. [GitHub - rokobuljan/zoompan: Pannable and zoomable area for graphic editors like Photoshop](https://github.com/rokobuljan/zoompan) - Pannable and zoomable area for graphic editors like Photoshop - rokobuljan/zoompan

13. [Simple Pan and Zoom Canvas](https://codepen.io/chengarda/pen/wRxoyB) - A simple example of internally handling scrolling and zooming of canvas contents using mouse and tou...

14. [Guitar Scales: Major, Minor, Pentatonic & Modes on the ...](https://muted.io/guitar-scales/) - Visualize scales on the guitar fretboard (major, minor, pentatonic & modes). Plus, see the scale pos...

15. [GitHub - hoxas/ScaleTool: Web app for visualizing scale notes, notes on a fretboard and chords on a fretboard with customizable inputs, powered by React.](https://github.com/hoxas/ScaleTool) - Web app for visualizing scale notes, notes on a fretboard and chords on a fretboard with customizabl...

16. [GitHub - cube-dan/fretboard-svg: A music theory app for visualizing chords and scales on a guitar's fretboard.](https://github.com/cube-dan/fretboard-svg) - A music theory app for visualizing chords and scales on a guitar's fretboard. - cube-dan/fretboard-s...

