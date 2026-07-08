# Feature Proposal — Markerless Fretboard Tracking

**Status:** Proposed / research (not yet scoped for a work package)
**Raised:** 2026-07-07
**Owner:** Michael

---

## Motivation

Today the fretboard overlay is pinned by a **one-shot homography** computed at
calibration time (manual 4-tap or a single ChArUco detection). Nothing
re-estimates the fretboard pose per frame, so:

- The projected fret grid / finger-target dots **stay frozen** where the guitar
  was at calibration time. When the guitar moves — even a little — the overlay
  no longer lines up with the real fretboard.
- This is **working as designed**. The current spec
  (`docs/plans/implementation-work-packages.md`) lists *"markerless fretboard
  tracking in a shipped build"* and *"standing/moving play"* as explicit
  **non-goals**, on the assumption of a static, seated reference setup.

The desired end-state UX is that the overlay **follows the guitar in real time,
with no printed marker** — the player can move naturally and the fret grid /
finger targets / zoom crop stay locked to the physical fretboard.

## What "markerless tracking" means here

Per frame (ideally inside the existing vision Web Worker, alongside MediaPipe
`HandLandmarker`), detect the guitar neck / fretboard and recover its pose so we
can produce a fresh image→fretboard **homography `H`** every frame — replacing
the single static `H` with a continuously updated one. No ChArUco board, no
physical markers on the instrument.

Candidate technical approaches to evaluate (this is the point of the research
prompt below):
- **Fret/string line detection** (edge/Hough/LSD) → recover the fretboard quad
  and solve `H` from detected fret lines + string lines.
- **Learned keypoint / segmentation model** (nut, fret positions, neck edges)
  running in-browser (TF.js / ONNX Runtime Web / MediaPipe custom task).
- **Object/plane tracking** (feature tracking, optical flow, or a planar
  tracker) seeded from the initial calibration and updated each frame.
- **Hybrid**: keep the one-shot calibration as the anchor, then track frame-to
  frame deltas cheaply (much lighter than full re-detection every frame).

## Why it's hard / constraints to respect

- **Frame budget.** The vision loop already runs MediaPipe hands + audio
  analysis every frame in a worker. Any tracker has to fit the remaining
  per-frame budget (target ~30fps) — a full per-frame OpenCV/DNN pass may be too
  heavy. Frame-to-frame tracking (cheap) vs full re-detection (expensive) is a
  key tradeoff.
- **Runs in the browser.** WASM/WebGPU only; model size and cold-start matter
  (the existing OpenCV.js ChArUco path already pulls ~13MB WASM).
- **Occlusion.** The fretting hand covers much of the fretboard — the tracker
  must be robust to partial occlusion (this is exactly where the current decay
  logic was *meant* to help).
- **Webcam quality / lighting.** Consumer webcams, variable lighting, motion
  blur, non-frontal angles.

## Integration points in the current codebase

Groundwork is already in place for a live confidence signal:

- **Homography store:** `apps/web/src/perception/perceptionStore.ts` —
  `setCalibration(H, conf)` is the single mutation point for `visionHot.H`,
  `calibConf`, `calibSeenAt`. A live tracker would call this (or an equivalent
  per-frame updater) each frame.
- **`calibLive` flag** (added 2026-07-07): `visionHot.calibLive` is `false`
  today, which HOLDS a static calibration at full confidence (no wall-clock
  decay). A live tracker should set `calibLive = true` and re-stamp `calibSeenAt`
  each confirmed frame — that re-activates the existing graceful-degradation
  decay (`perception/vision/degradation.ts`) for genuine occlusion.
- **Worker→main channel:** the vision worker
  (`apps/web/src/perception/vision/visionWorker.ts`) already owns the frames and
  a `currentH`; a re-estimated `H` could ride back on the existing `visionFrame`
  message. Note `controller.ts` currently **ignores** `calib`-type events from
  the worker (`applyVisionFrame`) — that gate would need to open for a live
  tracking path.
- **Consumers** (all just read `visionHot.H` per frame, so they get tracking for
  free once `H` updates): `overlay/drawVision.ts` (fret grid + dots),
  `shell/ZoomPane.tsx` (live crop), `perception/vision/targetDots.ts`.

## Open questions

- Marker-based-on-instrument (small ChArUco/AprilTag sticker taped to the
  headstock/body) as a cheaper, more robust interim step vs fully markerless?
- Is frame-to-frame planar tracking (seeded by the one-shot calibration) enough,
  avoiding a per-frame detector entirely?
- Any existing in-browser guitar-AR project we can build on or learn from?

---

## Perplexity deep-research prompt (copy/paste)

> I'm building a browser-based guitar practice app (React + Vite, TypeScript). It
> runs a live webcam feed and overlays a virtual fretboard grid and finger-target
> dots on the player's real guitar. Today I calibrate the fretboard position ONCE
> (via a ChArUco board or 4 manual corner taps) and compute a single image→
> fretboard homography — but it doesn't track, so the overlay drifts the moment
> the guitar moves. I want **real-time markerless fretboard / guitar-neck tracking**
> that re-estimates the fretboard pose every frame, running entirely in the
> browser.
>
> Do deep research and give me a structured report covering:
>
> 1. **Existing open-source projects.** Search GitHub, GitLab, Hugging Face, and
>    the web for anything that detects or tracks a guitar neck / fretboard / frets
>    / strings from video, especially real-time and/or in-browser. Include AR
>    guitar tutor apps (e.g. anything like "AR guitar", "fretboard AR", "guitar
>    fret detection", "chord overlay camera"), research demos, and hobby repos.
>    For each: what it does, the technique, the stack, real-time capability,
>    license, last activity, and whether it runs client-side.
>
> 2. **Academic / technical approaches.** Papers and methods for guitar fretboard
>    detection and pose estimation: classical CV (Hough/LSD line detection of
>    frets & strings, homography from detected fret lines, vanishing-point
>    geometry) vs learned methods (keypoint detection of nut/frets, semantic
>    segmentation of the neck, planar object pose networks). Summarize accuracy,
>    robustness to occlusion (the fretting hand covers the board), and compute
>    cost.
>
> 3. **In-browser feasibility.** Which of these can realistically run per-frame at
>    ~30fps in a web app using TensorFlow.js, ONNX Runtime Web, MediaPipe custom
>    tasks, OpenCV.js/WASM, or WebGPU? Model sizes, latency, cold-start. I already
>    run MediaPipe HandLandmarker + audio analysis every frame in a Web Worker, so
>    the tracker must fit a tight remaining budget.
>
> 4. **Cheaper interim options.** Compare fully-markerless tracking vs (a) a small
>    fiducial marker (ChArUco/AprilTag/ArUco sticker) attached to the guitar
>    headstock or body and re-detected each frame, and (b) frame-to-frame planar
>    tracking / optical flow seeded from a one-time calibration (so I avoid a full
>    per-frame detector). Which gives the best robustness-for-effort?
>
> 5. **Datasets** for guitar fretboard/neck detection or pose, if any exist.
>
> 6. **Recommendation.** Given a browser React/Vite app with a per-frame compute
>    budget already partly spent on hand tracking, rank the approaches by
>    feasibility-vs-effort and suggest a concrete first implementation path.
>
> Prioritize concrete, linkable sources (repos, papers, demos) over generic
> explanations, and flag anything that is real-time and client-side.
