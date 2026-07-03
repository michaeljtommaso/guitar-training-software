# Opus Stack & Implementation Plan — Real-Time Multimodal Guitar Tutor

> **Status:** Planning / architecture only. No application code yet.
> **Author lane:** Opus 4.8 cross-judgment pass over the prior research scaffold (`docs/research-synthesis.md`, `research/agent-reports/`).
> **Date:** 2026-07-02.
> **Companion docs:** [technology-decision-records.md](technology-decision-records.md) · [implementation-work-packages.md](implementation-work-packages.md) · [open-questions-and-research-gaps.md](open-questions-and-research-gaps.md)

This document is the comprehensive front-to-back stack and architecture plan. It (1) records the sanity-check of the existing research, (2) recommends a stack for every layer with alternatives and tradeoff tables, and (3) explains how the whole system works end to end. Concise decision records live in the ADR doc; the ordered build plan lives in the work-packages doc.

---

## 0. TL;DR — recommended MVP stack

The wedge is an **open-chord coach**: constrained seated setup, standard tuning, one webcam + one mic, marker-assisted fretboard calibration, all real-time perception on-device, frontier model for slow-path coaching only.

1. **Platform** — **Browser-first installable PWA** (Chromium primary; Safari 26 / iOS 26 now viable). Tauri desktop deferred to Beta for pro-audio users; native mobile deferred further.
2. **Frontend** — **React 18 + Vite 5 + TypeScript**, **Zustand** session store, Michael's two-layer CSS custom-property **design tokens** + dual-font (Hanken Grotesk UI / IBM Plex Mono numerals), `lucide-react` icons, no emoji.
3. **Overlay** — **Canvas 2D** overlay driven by `requestVideoFrameCallback`, composited over the `<video>` element. WebGL/WebGPU overlay reserved for later.
4. **Capture** — `getUserMedia` (720p/30fps video + mono audio), Web Audio graph, **AudioWorklet** DSP (~13 ms), 48 kHz.
5. **Vision** — **MediaPipe Tasks-Vision `HandLandmarker`** (Apache-2.0) for 21-pt hands; **ChArUco** clip-on board for fretboard homography (MVP); geometric fingertip→string/fret mapping via **OpenCV.js** homography. Markerless learned detector deferred.
6. **Audio ML/DSP** — **Spotify Basic Pitch** (Apache-2.0) for polyphonic note events via **ONNX Runtime Web** (WebGPU EP, WASM fallback); **CREPE→onnxcrepe** for tuner/monophonic; **custom AudioWorklet spectral-flux onset detector** (replaces license-encumbered Madmom); chroma + template chord match for open chords, small CRNN later.
7. **Fusion engine** — deterministic **TypeScript** state machine + confidence-weighted event fusion; typed event schema; **lessons-as-data** (YAML/JSON); feedback policy = one correction / 1–2 s, confidence-gated, false-positive-averse.
8. **Coaching model** — frontier multimodal model (**"Fable 5 Clubs" = placeholder**) on the **slow path only** (explanations, session summaries, ambiguity resolution) over structured events + sparse keyframes; never the correctness loop. Fallback = template/rules coach.
9. **Backend** — thin **FastAPI (Python)**; **core loop needs no backend**. Backend hosts the model proxy (key-hidden, injection-defended, token-capped — per the McCallos `fn-claude-proxy` pattern), clip/session storage, content service. WebSocket only for the coaching stream.
10. **Data** — **local-first**: **IndexedDB (Dexie)** for sessions/calibration/telemetry; optional **Firebase (Auth + Firestore + Cloud Storage)** for opt-in sync/clip upload later *(amended 2026-07-03 — was Supabase; see ADR-010)*. Chord library from UCI fingering data + hand-authored lessons.
11. **DevOps** — Vite static build on Michael's **VPS** (or Vercel/Netlify); FastAPI in **Docker**; **GitHub Actions** CI (typecheck/lint/unit/model-eval smoke); **Sentry** privacy-first with masked replay; hard cost cap on the model proxy.
12. **License posture** — **MIT/Apache-2.0-clean core** (MediaPipe, Basic Pitch, ONNX Runtime, OpenCV). Madmom (CC BY-NC-SA models), Essentia.js (AGPLv3), and Ultralytics YOLO/RT-DETR (AGPL-3.0, travels with weights) are **offline-experiment-only** — do not ship them.

Full rationale and alternatives per layer are in §5–§16.

---

## 1. Research sanity-check (verification pass)

Three narrow Sonnet checker-agents independently verified the prior reports on 2026-07-02 (targeted web checks, not a second deep pass). Verdicts and the deltas that changed this plan:

### 1.1 Commercial landscape — **PARTIALLY CONFIRMED**
- The market is **solidly audio-first**. Yousician, Rocksmith+, Fender Play (Feedback Mode / MatchMySound), Gibson App, and Uberchord all score via **mic or audio interface**; none ships reliable webcam finger/string-error detection. Sources re-confirmed on official/partner pages (e.g. Fender Feedback Mode is described by partner MatchMySound as listening to guitar and giving pitch/rhythm/tempo feedback: <https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html>).
- **Nuance to encode:** the strong form "*no* product uses a camera" is overstated. **Fretello Mirror** ships an AR overlay that uses the front camera to show *where to put fingers* (<https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/>). It is **guidance overlay, not error detection** — it does not tell you which string you muted or which finger is wrong. The gap we target (CV **error attribution**) still stands.
- **Caution:** an alleged "TrueFire Smart Tutor webcam analysis" feature traced back to an AI-generated roundup and could **not** be confirmed on TrueFire's own pages. Treat third-party "app X uses MediaPipe to watch your hands" claims as unverified until seen on a first-party surface.
- **Competitive reality:** hardware-sensor products (**Fret Zealot** LED strip, **LiberLive C1** stringless pads — CES 2025, **Jamstik** MIDI guitar) solve finger feedback *without* CV. They are the real alternative to a CV approach and a reason to keep the CV bar honest.

### 1.2 Open source — **CONFIRMED**
- **No mature, maintained OSS app** combines real-time pedagogy + audio transcription + CV fingering verification. Every cited repo exists but is a **narrow block or 0–2★ prototype**. Guitariz (MIT, ~247 commits, v1.7.0) is the most "real" app but is **audio/chord + virtual fretboard, no CV**. The only repos touching audio+vision together (`davidshavin4/…`, `carlosmbe/TappyTabs`) are 5–6-commit prototypes.
- **New references surfaced** (fold into research): **LadderSym** — multimodal guitar *error detection* research, arXiv 2510.08580 (no public code); **Guitar-TECHS** dataset, arXiv 2501.03720. Both are directly on-thesis.
- **Flag:** `spotify/basic-pitch-ts` shows little activity since Aug 2022. It still runs, but treat the browser AMT path as "Basic Pitch weights via ONNX Runtime Web" with the TS port as a convenience, not a maintained dependency.

### 1.3 Building blocks — **OK, with corrections that change the plan**
| Block | Verified status (mid-2026) | Impact on plan |
|---|---|---|
| MediaPipe Hands | Classic `@mediapipe/hands` is **Legacy**; current API is **`@mediapipe/tasks-vision` `HandLandmarker`** (Apache-2.0). <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js> | Use Tasks-Vision, not the deprecated solution. |
| Basic Pitch (+ TS) | **Apache-2.0**, polyphonic, runs in browser. | Safe to ship. Primary audio note model. |
| ONNX Runtime Web + WebGPU EP | **Production-ready**; WebGPU reached **Baseline Jan 2026**. <https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html> | Default in-browser inference runtime. |
| WebGPU support | Chrome/Edge stable; **Safari 26 / iOS 26 stable**; Firefox stable on Win/macOS, **Linux still tracking**. <https://caniuse.com/webgpu> | Ship WebGPU + **WASM/CPU fallback**. iOS now viable. |
| AudioWorklet | Universal; ~13 ms real-time DSP. <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet> | Backbone of the audio loop. |
| CREPE | MIT, but **no first-party browser port**; use `onnxcrepe` + `onnxruntime-web`. | Tuner / monophonic path with a manual ONNX export step. |
| **Madmom** | **CC BY-NC-SA 4.0 model files (non-commercial)** + unmaintained since 2018. | **Do not ship.** Replace with custom AudioWorklet onset/beat. |
| **Essentia.js** | **AGPLv3** + stale since 2022. | Offline experiments only; not in the shipped app. |
| **Ultralytics YOLO / RT-DETR** | **AGPL-3.0 travels with exported weights**; commercial use needs Enterprise license. <https://www.ultralytics.com/license> | For a shippable fretboard detector, use ChArUco (MVP) and a **permissively-licensed** base (e.g. RT-DETR from PaddleDetection, Apache-2.0) later. |
| ArUco / **ChArUco** | Standard; **ChArUco preferred** for corner accuracy; OpenCV Apache/BSD. | Use ChArUco board for MVP calibration. |

**Net effect of the sanity-check:** the prior research's *strategy* is sound (hybrid: local real-time perception + frontier slow-path coach; open-chord MVP; marker calibration first). The corrections are (a) the MediaPipe API name, (b) a hard **license firewall** around Madmom/Essentia/Ultralytics, and (c) softened market language re Fretello Mirror.

---

## 2. Product framing and the wedge

**What we are building:** a personal, real-time multimodal guitar coach that watches (webcam) and listens (mic), and — unlike the incumbents — attributes *why* a chord failed: wrong fret, wrong string, muted string, finger too far behind the fret, late strum.

**Why this is defensible even as a personal project:** the entire commercial market answers "*did you play the right thing?*" (audio). Almost none answers "*which finger caused the mistake?*" (vision+audio fusion). Fretello Mirror shows the AR-overlay direction is commercially interesting but stops at guidance. That fusion/error-attribution problem is the hard, open, and differentiated core — see §9.

**Scope discipline (MVP = "Phase 0" in `docs/mvp-roadmap.md`):** open chords (C, G, D, A, E, Am, Em, Dm), standard tuning, seated, front/angled webcam, mono mic, single user, marker calibration. Everything else (barre chords, capo, songs/tabs, markerless, mobile, multi-user) is explicitly deferred.

---

## 3. Platform decision — web/PWA vs desktop vs mobile

| Option | Pros | Cons / risks | Maturity | Why choose / defer | 
|---|---|---|---|---|
| **Browser PWA (recommended MVP)** | Zero install; `getUserMedia` + Web Audio + AudioWorklet + WebGPU all shipped; fastest overlay/lesson iteration; matches Michael's React/Vite/PWA muscle memory | Browser audio stack variance; camera-angle control is user-dependent; heavy multi-model inference contends for one main thread + GPU; iOS historically weakest (now improved) | **High** — all required web APIs are Baseline/stable in 2026 | **Choose for MVP.** Best speed-to-feedback; capabilities are finally sufficient. |
| **Tauri desktop** | Best low-latency audio (native device access, ASIO/CoreAudio); bundle local models; long-session stability; small binary vs Electron; Rust sidecar for DSP | Extra build target; native audio plumbing; more packaging/update surface | **High** (Tauri 2.x) | **Defer to Beta.** For pro-audio/serious users once the web MVP proves the loop. |
| **Electron desktop** | Ubiquitous, huge ecosystem | Large bundles, heavier memory, weaker native-audio story than Tauri | High | **Reject** unless a Node-only native dep forces it. |
| **Native mobile (iOS/Android)** | Best camera ergonomics (phone as fretboard cam); on-device NPU | Highest build cost; real-time multi-model on battery is hard; audio-session complexity | Medium for this workload | **Defer.** Phone as a *capture/review companion* first, full native later. |
| **Capacitor-wrapped PWA (mobile)** | Reuse the web app on phones; camera plugin | Real-time perf ceiling; still browser engine under the hood | Medium | **Later**, as the cheapest path to a mobile capture companion. |

**Decision:** Browser PWA for MVP → Tauri for Beta → mobile companion later. See ADR-001.

---

## 4. End-to-end architecture (how it works, front to back)

```text
┌────────────────────────── CLIENT (browser PWA, all real-time perception) ──────────────────────────┐
│                                                                                                     │
│  getUserMedia ──┬─► <video> (720p/30) ─► requestVideoFrameCallback ─► VISION WORKER (OffscreenCanvas)│
│                 │        │                                            ├─ MediaPipe HandLandmarker    │
│                 │        │                                            ├─ ChArUco homography (OpenCV.js)│
│                 │        │                                            └─ fingertip → string/fret map  │
│                 │        └─► Canvas 2D OVERLAY  ◄───────────────────── fused diagnoses (R/Y/G, halos) │
│                 │                                                                                     │
│                 └─► MediaStreamAudioSourceNode ─► AudioWorklet ─► AUDIO WORKER                         │
│                          (48 kHz)                 (ring buffer)   ├─ spectral-flux onset (own DSP)     │
│                                                                   ├─ Basic Pitch (ONNX RT Web/WebGPU)  │
│                                                                   ├─ CREPE/onnxcrepe (tuner/mono)      │
│                                                                   └─ chroma → chord template match     │
│                                                                                                        │
│  FUSION ENGINE (main thread, deterministic TS) ── consumes typed vision+audio events ─► FEEDBACK POLICY│
│      ├─ lesson state machine (lessons-as-data)                                    (one hint / 1–2 s)    │
│      ├─ confidence-weighted fusion                                                                     │
│      └─ emits: immediate overlay hints  +  structured session event log (IndexedDB/Dexie)              │
│                                                                                                        │
│  On pause / on request / post-session ──► COACHING CLIENT ──► (WebSocket/HTTPS) ──►                    │
└────────────────────────────────────────────────────────────────────────────────────────┬────────────┘
                                                                                           │  sparse:
                                                                                           │  structured events
                                                                                           │  + 1–3 keyframes
                                                                                           ▼
┌───────────────────────── BACKEND (thin FastAPI, optional for core loop) ──────────────────────────────┐
│  /coach   ─► MODEL PROXY (key-hidden, injection-defended, token-capped) ─► FRONTIER MULTIMODAL MODEL    │
│  /content ─► lessons, chord/fingering library (UCI + authored)          ("Fable 5 Clubs" placeholder / │
│  /clips   ─► opt-in clip + session store (Supabase Postgres + object storage)   Claude/GPT/Gemini live) │
│  fallback ─► template/rules coach (no external model)                                                   │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Two-speed design (the load-bearing decision):**
- **Fast path (0–250 ms, 100% on-device):** capture → local perception → fusion → deterministic overlay hints. Never blocks on the network or a large model.
- **Slow path (0.5–2 s+, optional, backend):** structured events + sparse keyframes → frontier model → natural-language coaching, ambiguity resolution, session summaries, drill generation.

This is the single most important architectural choice and it is well-supported by the latency budget (§14): frontier round-trips (300 ms–2 s) cannot close a sub-250 ms correctness loop, so they must not be in it.

---

## 5. Frontend

### 5.1 Framework / build / language
| Option | Pros | Cons | Maturity | Recommendation |
|---|---|---|---|---|
| **React 18 + Vite 5 + TS (recommend)** | Michael's default; huge ecosystem; Vite dev speed; workers/WASM/WebGPU all first-class | React overhead irrelevant here (perception is in workers) | High | **MVP + later.** |
| Svelte/SvelteKit | Lean runtime, great for canvas-heavy | New muscle memory; smaller ecosystem for this | High | Defer; no benefit over React here. |
| SolidJS | Fine-grained reactivity | Niche; ecosystem gaps | Med | Reject for now. |

**Decision:** React 18 + Vite 5 + TypeScript (ADR-002). React 19 is fine if a dependency needs it; nothing in scope requires it.

### 5.2 State management
- **Zustand** for session/lesson/calibration/UI state (matches Cornell degree-planner precedent). Redux is overkill; Context re-render churn is wrong for high-frequency updates.
- **Do not** push 30 fps perception state through React. Perception lives in workers and a module-level store; the overlay reads it via `requestVideoFrameCallback` / `useSyncExternalStore`, so React re-renders stay coarse (lesson step, chord target, aggregate confidence).

### 5.3 Rendering / overlay
| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **Canvas 2D (recommend MVP)** | Simple; enough for chord diagrams, finger halos, R/Y/G string bars, fret grid; easy to reason about | CPU-bound if overdrawn | **MVP.** Draw in an OffscreenCanvas worker where possible. |
| WebGL (PixiJS/regl) | GPU-accelerated many-sprite overlays | More complexity than MVP needs | Later, if overlays get heavy. |
| WebGPU render | Future-proof, shares device with inference | Overkill now | Roadmap. |
| SVG/DOM overlay | Trivial for static chord diagrams | Bad for per-frame updates | Use only for static lesson chrome. |

### 5.4 UI / design system
- Reuse Michael's **two-layer CSS custom-property token system** (raw palette → semantic tokens; full dark-mode re-declaration; no per-component theme branches) and the **dual-font signature** (Hanken Grotesk for UI, **IBM Plex Mono + `tabular-nums`** for all numbers: BPM, timing offsets in ms, confidence %, fret numbers). `lucide-react` icons; **no emoji**; sentence-case buttons, UPPERCASE eyebrows.
- **Overlay-specific token need:** a semantic **status triad** — `--correct` (green), `--warn` (yellow/amber), `--error` (red) — plus a `--hover`/`--uncertain` neutral for low-confidence states. This is the confidence-aware color contract the whole UX leans on. Chart/canvas can't read CSS vars, so mirror the triad into a JS constants module (documented exception, same pattern as McCallos Chart.js).
- **Component-library stance:** hand-rolled primitives over a heavy kit (Michael's precedent). Optionally Radix primitives for a11y-critical widgets (dialogs, sliders) only.

---

## 6. Real-time capture

- **Video:** `getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 } })`. Process full frames at a low rate and hand ROIs at a higher rate. Use `requestVideoFrameCallback` (not `requestAnimationFrame`) so vision work is aligned to actual decoded frames.
- **Audio:** `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` — the browser's voice-tuned processing **hurts** instrument analysis; disable it. Route through an `AudioContext` at 48 kHz → `AudioWorkletNode` with a lock-free ring buffer to the audio worker.
- **Device support:** enumerate devices; let the user pick mic (built-in vs interface) and camera. Recommend an external/clip cam for fretboard angle in the setup wizard.
- **Threading:** Vision worker (OffscreenCanvas + WASM/WebGPU), Audio worker (AudioWorklet + WASM), main thread for fusion + React. This keeps the UI responsive and the perception jitter-free.

---

## 7. Audio ML / DSP

**Design principle:** small, license-clean, chunked models on-device; no license-encumbered toolkits in the shipped app.

| Task | Recommendation (MVP) | Alternatives considered | Notes |
|---|---|---|---|
| **Onset / strum timing** | **Custom AudioWorklet spectral-flux detector** (own DSP) | Madmom (❌ NC + abandoned), Essentia (❌ AGPL), aubio (⚠️ GPL) | License-clean and low-latency; onset is a well-understood DSP problem. |
| **Polyphonic note events** | **Spotify Basic Pitch** (Apache-2.0) via ONNX Runtime Web (WebGPU EP → WASM fallback); `basic-pitch-ts` as convenience | Custom CRNN (later), FretNet/`amt-tools` (research/offline) | Works best on solo guitar; chunk for near-real-time. |
| **Monophonic pitch / tuner / bends** | **CREPE via `onnxcrepe` + onnxruntime-web** | YIN/pYIN DSP (simpler, less robust) | Requires a manual ONNX export step. Great for the tuner setup step. |
| **Chord recognition (open chords)** | **Chroma/CQT → template match** vs expected chord set (incl. a `noise/silence/invalid` class) | Small CRNN/conformer-lite over log-mel+chroma (Phase 1) | Template match is enough for 8 open chords and is interpretable. |
| **String-level validation** | Derive expected pitch classes from the target fingering; compare observed note set → **missing / extra / muted** | — | This is where fusion (§9) gets its audio evidence. |
| **Offline training/eval** | `amt-tools`, FretNet, `guitar-transcription-with-inhibition`, Essentia (offline only) | — | Research lane; outputs distilled to license-clean shippable models. |

**Datasets for audio:** GuitarSet (string/fret + chord labels, MIT), IDMT-SMT-GUITAR, Isolated Guitar Chords (HF, has a Noise class), plus the newer **Guitar-TECHS** (arXiv 2501.03720). See §12.

---

## 8. Vision ML / CV

**Design principle:** start with marker calibration to make the geometry tractable, then earn markerless later with collected data.

| Sub-problem | Recommendation (MVP) | Alternatives | Notes |
|---|---|---|---|
| **Hand landmarks** | **MediaPipe Tasks-Vision `HandLandmarker`** (Apache-2.0), WASM/WebGPU | Custom keypoint net (data-hungry) | 21 pts/hand, handedness, real-time in browser. Not guitar-aware — you map landmarks to the fretboard yourself. |
| **Fretboard calibration** | **ChArUco clip-on board** → homography via **OpenCV.js** (`getUserMedia` frame → normalized fretboard coords) | Manual 4-corner tap calibration (fallback); plain ArUco (less accurate) | ChArUco > ArUco for corner accuracy. Also offer a manual-tap fallback for users without a printed board. |
| **Fretboard localization (markerless)** | **Deferred.** Roadmap: guitar ROI → neck pose → learned fret/string keypoints → temporal smoothing | Ultralytics YOLO/RT-DETR (❌ AGPL for shipping); **RT-DETR from PaddleDetection (Apache-2.0)** or train-from-scratch for a shippable detector | Only build after collecting labeled frames (§12). Keep it license-clean. |
| **Fingertip → string/fret** | Geometric post-process: project fingertip into normalized fretboard, nearest string, fret cell, behind-fret distance, adjacent-string mute risk | Learned contact classifier (Phase 1) | Deterministic and debuggable first. |
| **Strum/pick hand** | Landmark wrist velocity + stroke direction classifier (simple) | — | Feeds timing fusion. |
| **Posture (optional)** | MediaPipe **Pose** + simple rules | — | Nice-to-have; not MVP-critical. |

**The honest hard part:** not landmarks or pitch individually, but **camera-space → fretboard-space mapping under occlusion, motion blur, and varied angles**. Markers make MVP viable; markerless is a data project (§12), not a weekend model swap.

---

## 9. Fusion engine (the differentiated core)

Vision alone can't tell if a fretted note *rang*; audio alone can't tell *which finger* muted it. Fusion is where the product's value lives.

### 9.1 Event schema (typed, confidence-carrying)
```ts
// All events timestamped (audioClock ms) and confidence-tagged [0..1].
type AudioEvent =
  | { t:number; kind:'onset'; strength:number; conf:number }
  | { t:number; kind:'chord'; label:string; conf:number }        // incl. 'noise'|'silence'
  | { t:number; kind:'notes'; pitches:number[]; conf:number }    // MIDI note numbers
  | { t:number; kind:'tuning'; string:number; cents:number };

type VisionEvent =
  | { t:number; kind:'hand'; landmarks:[number,number,number][]; handed:'L'|'R'; conf:number }
  | { t:number; kind:'fingerAssign'; assigns:{finger:string;string:number;fret:number;conf:number}[] }
  | { t:number; kind:'calib'; homographyConf:number }
  | { t:number; kind:'strum'; dir:'down'|'up'|'none'; conf:number };

type Diagnosis = {                 // fusion output → feedback policy
  t:number;
  code:'wrong_fret'|'wrong_string'|'muted_string'|'behind_fret'|'missing_note'|'late_strum'|'ok';
  target: LessonStepRef;
  evidence:{ audio?:string; vision?:string };
  severity:number;                 // 0..1
  conf:number;                     // fused confidence
};
```

### 9.2 Fusion logic
- Maintain real-time **session state**: current lesson step, target chord/notes, recent chord posterior, current finger-placement posterior, recent onsets, timing offset, calibration confidence.
- **Confidence-weighted combination**, not hard AND. Example resolutions (from the architecture report, kept):
  - Vision ≈ C-major shape **but** audio missing E → "shape close; let the high-E ring."
  - Audio correct **but** vision differs from canonical fingering → accept as valid alternate (beginner mode may still nudge softly).
  - Target change at beat 3, audio change 240 ms late, vision hand-move late → "prepare index finger earlier before beat 3."

### 9.3 Feedback policy (trust-preserving)
- **One correction at a time**, at most one major hint per **1–2 s** while playing.
- **Confidence gates**: below threshold, say "likely…" or stay silent. A wrong confident correction costs more trust than a missed one → **false-positive-averse** thresholds.
- Rank candidate feedback by: confidence → pedagogical importance → user benefit → non-repetition → actionability.
- The frontier model may **propose** from a **bounded taxonomy** only; it never overrides the deterministic R/Y/G loop.

### 9.4 Lessons-as-data
```yaml
id: open_chords_c_major
target: { chord: C_major }
accepted_fingerings:
  - { index: {string:2,fret:1}, middle:{string:4,fret:2}, ring:{string:5,fret:3} }
expected_strings: [1,2,3,4,5]
avoid_strings: [6]   # standard numbering: 1 = high e … 6 = low E (C major avoids low E)
success_criteria: { hold_time_ms:1200, min_audio_conf:0.8, max_muted_strings:0 }
feedback_priority: [wrong_fret, accidental_muting, missing_string, late_strum]
```
Lessons are content, not code — authored/edited without redeploying the engine.

---

## 10. Backend

**Core principle:** the real-time loop is **client-only**. The backend is optional and thin, existing for the model proxy, content, and opt-in storage.

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **FastAPI (Python) (recommend)** | Same language as the ML/DSP research lane (Basic Pitch, amt-tools, training); async; easy model-proxy + WebSocket; matches Guitariz precedent | Michael's app-backend precedent is JS/Firebase, so slightly new for him | **MVP + later.** The Python affinity with the model/eval work wins. |
| Node/NestJS | Matches Michael's TS comfort; one language across stack | Re-implements or shells out for any Python ML glue | Viable alternative if Michael prefers all-TS; ADR-009 records the tradeoff. |
| Supabase Edge Functions / serverless | No server to run; scales to zero | Cold starts; streaming/WebSocket coaching is awkward; heavier Python deps don't fit | Use for simple content/CRUD, not the coaching stream. |
| Firebase Functions (his McCallos default) | His deepest muscle memory, callable/rules patterns, cost controls | Node runtime → same Python-glue friction; overkill for a single-user tool | Reasonable if he wants to reuse the `fn-claude-proxy`/cost-cap patterns verbatim. |

**Backend responsibilities:** (1) **model proxy** — hide the frontier key, prompt-injection defense, token/cost caps, `maxInstances` (directly port the McCallos `fn-claude-proxy` + `sec-cost-controls` patterns); (2) **content** — lessons + chord/fingering library; (3) **clips/sessions** — opt-in storage; (4) **template coach fallback**. **Transport:** HTTPS for content; **WebSocket only for the coaching stream** (sparse events + keyframes), never the perception loop.

---

## 11. Data layer

**Local-first, because the data is biometric home video/audio and the app is single-user first.**

| Concern | Recommendation (MVP) | Later |
|---|---|---|
| On-device store | **IndexedDB via Dexie** — sessions, calibration profiles, telemetry, drafts | same |
| Cross-device sync / clips | none in MVP (local only) | **Firebase (Auth + Firestore + Cloud Storage)** opt-in; per-user security rules *(amended 2026-07-03 — was Supabase; ADR-010)* |
| Chord/fingering library | **UCI Guitar Chords Finger Positions** (2,633 defs) + hand-authored, shipped as static JSON | authored lesson graph |
| Training/annotation data | Parquet/JSON + JAMS (music) + COCO-style keypoints (vision) in the research lane | active-learning store |
| Schemas | **Zod** at every write/read boundary (Michael's house rule: Zod as the write gate, normalize at the read boundary) | same |

**Why not Firebase/Firestore here:** great for his multi-tenant SaaS, but this app is single-user, local-first, and clip storage is object-heavy — Supabase/Postgres + object storage is a cleaner fit and keeps the option of self-hosting on the VPS. Firestore stays a valid alternative if he wants to reuse McCallos infra wholesale (ADR-010). *(Superseded 2026-07-03: the owner chose Firebase for the future sync/auth layer — familiarity and auth features outweigh Postgres purity for a one-developer product. See the amended ADR-010.)*

---

## 12. Model layer — frontier multimodal + on-device fallback

### 12.1 "Fable 5 Clubs" — treat as a placeholder
Per the brief, **"Fable 5 Clubs" is an unknown/placeholder** for a frontier multimodal *streaming* model. Do **not** assume it is a shipping public API. Design to a **capability contract**, then bind whatever real model best satisfies it.

**Required capabilities for the coaching role:**
- Streaming or near-real-time multimodal input (image sequence/short clip + audio-derived features + structured JSON).
- Image/keyframe understanding (finger/hand/fretboard).
- Structured tool/JSON output (so coaching maps to the bounded feedback taxonomy).
- Latency acceptable for assistant-style turns (sub-2 s to first token ideal).
- Bounded, predictable per-session cost.
- Privacy/compliance path for user video/audio (opt-in, redaction).

**Concrete equivalents to bind against (any one satisfies most of the contract):** Anthropic Claude / Fable-class multimodal models; OpenAI Realtime (audio+vision); Google Gemini Live. The proxy abstracts the provider so the model is swappable (ADR-011). *(Note: this repo's environment lists `claude-fable-5` as a real model ID; still, "Fable 5 **Clubs**" specifically is unverified, so we bind to the capability contract, not the name.)*

### 12.2 Four coaching modes (slow path only)
1. **Conversational coach** — "why does my C sound bad?" over recent event timeline + optional clip.
2. **Ambiguity resolver** — when audio/vision disagree, send 1–3 frames + structured data; returns ranked hypotheses (not ground truth).
3. **Session summarizer** — recurring issues → next drills.
4. **Content generator** — personalized chord-transition drills from failure patterns.

### 12.3 On-device fallback (default foundation)
Even with a frontier model, the shipped foundation is: **local rule engine** for immediate corrections + **teacher-authored explanation templates with slot filling** (e.g. `accidental_muting_high_e` → curated coaching text). This yields strong pedagogy with zero live-model dependency and is the graceful-degradation path when the model/network is unavailable or when the user picks **Local-only mode**.

**Hard safeguard:** the frontier model is *never* in the red/green correctness loop; all user-facing feedback carries confidence; real-time-mode model output is constrained to the bounded taxonomy.

---

## 13. Annotation / data pipeline

Public data bootstraps audio; the **fusion/pedagogy problem needs proprietary multimodal data** (video + audio + finger/string/fret + mistake labels).

- **Public bootstrap:** GuitarSet, IDMT-SMT-GUITAR, Isolated Guitar Chords, Guitar-TECHS (audio/label); UCI fingering (chord ontology); MediaPipe (hands). None has webcam + pedagogy error labels.
- **Custom capture (staged):** (1) controlled — a handful of players, front + fretboard-side angles, scripted deliberate errors; (2) in-the-wild opt-in home sessions; (3) hard-negative mining (low light, dark fretboards, capos, fast-strum blur, occlusion).
- **Annotation tooling (internal):** synced video + waveform + spectrogram, frame stepping, fretboard-grid overlay, fingertip/string/fret reassignment, mistake-taxonomy tagging, model-confidence display for **active learning** (label the uncertain clips first).
- **Formats:** JAMS (music), COCO-style keypoints (vision), structured JSON (lesson/error taxonomy).
- **License hygiene:** the shipped models must be trainable from **permissively-licensed** bases + our own data — do not bake AGPL/NC weights into anything shippable.

---

## 14. Latency budget

UX targets: overlays **<100 ms** perceived; chord update **150–300 ms**; timing feedback **<150 ms** after onset; NL coaching **0.5–2 s** (prefer on pauses); deterministic corrective hint **<250 ms**.

| Loop | Stages | Budget |
|---|---|---|
| **Vision** | capture 10–20 · landmarks 8–20 · geometry 5–15 · fingertip 2–5 · overlay 8–16 | **~35–70 ms** |
| **Audio** | buffer 20–40 · DSP 5–10 · onset/chord micro-model 10–30 · smoothing 5–10 | **~40–90 ms** |
| **Feedback** | fusion 5–15 · rules 5–10 | **~60–120 ms** total once context exists |
| **Frontier** | packaging 10–20 · RTT 50–200+ · inference 200–1000+ · render/TTS 50–200 | **~300 ms–2 s+** |

**Conclusion (drives §4):** local models own corrections; the frontier model owns explanation. WebGPU (Baseline Jan 2026) + AudioWorklet (~13 ms) make the on-device budgets realistic; keep a WASM/CPU fallback for the Firefox-Linux / older-Safari segment.

---

## 15. Deployment / DevOps, privacy & security

- **Local dev:** Vite dev server + FastAPI (`uvicorn --reload`); one `docker-compose` for backend + Supabase-local (or Postgres) if used.
- **Build/host:** Vite static build → Michael's **VPS** (nginx) or Vercel/Netlify; FastAPI in **Docker** on the VPS. Models served as static ONNX assets + WASM (COOP/COEP headers for `SharedArrayBuffer`/threads).
- **CI (GitHub Actions):** typecheck, ESLint, unit tests, a **model-eval smoke** (fixed audio/vision fixtures → assert accuracy/latency deltas), bundle-size budget. No secrets in the client.
- **GPU needs:** none required to *run* (WebGPU/WASM on-device). GPU is for the **research/training lane** only (fretboard detector, chord CRNN) — a cloud GPU box or Colab, not the app runtime.
- **Observability:** **Sentry** privacy-first per Michael's house pattern — PII scrub, **masked** on-error replay (video/audio must be masked/omitted), source maps, no-leak ErrorBoundary. Track latency histograms + false-feedback complaint rate.
- **Privacy/security:** **local-first perception**; upload only opt-in clips / selected frames / anonymized telemetry. Explicit **Local-only mode**. Model proxy carries the McCallos hardening: server-owned key (Secret Manager/env), prompt-injection defense, **hard cost cap kill-switch** (an alert is not a cap), rate limiting, `maxInstances`. Biometric hand imagery and home audio are sensitive — treat consent and deletion as first-class.

---

## 16. Testing / evaluation

| Layer | Metrics | MVP acceptance |
|---|---|---|
| Vision | landmark reprojection err; homography err; fingertip→string acc; fingertip→fret acc; contact-state F1; strum-dir acc | **fingertip→fret/string ≥ 85%** on the supported seated+marker setup |
| Audio | chord acc / weighted chord recall; onset F1; note P/R; timing MAE; muted-string AUROC | **open-chord classification ≥ 90%** clean; **strum timing MAE < 100 ms** |
| Fusion | mistake-classification acc; top-1/top-3 feedback correctness; calibration error by confidence bucket; interruption-regret | **false critical feedback < 5%** of lessons |
| Coaching | teacher-rated correctness/importance/phrasing/helpfulness | **teacher agreement on top feedback > 75%** |
| System | end-to-end hint latency; frame-drop rate; battery/thermal (mobile later) | **corrective hint < 250 ms** on the reference laptop |

- **Test data:** hold-out from GuitarSet/IDMT for audio; a small internal labeled webcam set for vision (bootstraps §13).
- **Human eval:** teachers label *was the correction correct / most important / helpfully phrased / would it help a beginner faster.*
- **Latency budgets are CI gates**, not aspirations — the model-eval smoke fails the build on regression.

---

## 17. Suggested repo structure (when build starts)

```text
guitar-tutor/
├─ apps/web/                 # React 18 + Vite 5 PWA (MVP)
│  ├─ src/perception/        #   vision + audio workers, AudioWorklet
│  ├─ src/fusion/            #   deterministic engine + schemas + lessons-as-data
│  ├─ src/overlay/           #   Canvas 2D overlay + design tokens
│  └─ src/coach/             #   slow-path coaching client + template fallback
├─ apps/desktop/             # Tauri (Beta)
├─ apps/annotation-tool/     # internal labeling UI (data lane)
├─ services/backend/         # FastAPI: model proxy, content, clips
├─ models/                   # ONNX assets + training/eval notebooks (research lane)
│  ├─ audio/ vision/ fusion/
├─ data/                     # schemas, lesson-content, sample-assets
├─ docs/                     # these planning docs
└─ infra/                    # docker, CI, nginx
```

---

## 18. Milestone alignment

The build order and verification gates are in [implementation-work-packages.md](implementation-work-packages.md). At a glance it maps to the roadmap: **WP-0** setup/license firewall → **WP-1** capture shell → **WP-2** audio open-chord loop → **WP-3** vision + marker calibration → **WP-4** fusion + deterministic corrections → **WP-5** slow-path coach (+template fallback) → **WP-6** data flywheel → **WP-7** hardening/Beta. Open uncertainties and how to close them are in [open-questions-and-research-gaps.md](open-questions-and-research-gaps.md).

---

## 19. Sources (verification pass, 2026-07-02)

- MediaPipe HandLandmarker (web) — <https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js>
- ONNX Runtime Web WebGPU EP — <https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html>
- WebGPU support — <https://caniuse.com/webgpu>
- AudioWorklet — <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet>
- Basic Pitch (TS) — <https://github.com/spotify/basic-pitch-ts>
- onnxcrepe (CREPE ONNX) — <https://github.com/yqzhishen/onnxcrepe>
- Madmom (license/maintenance) — <https://github.com/CPJKU/madmom>
- Essentia.js — <https://github.com/MTG/essentia.js>
- Ultralytics license — <https://www.ultralytics.com/license>
- ChArUco calibration — <https://docs.opencv.org/4.13.0/da/d13/tutorial_aruco_calibration.html>
- Fretello Mirror (AR overlay) — <https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/>
- Fender/MatchMySound Feedback Mode partner announcement — <https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html>
- LadderSym (multimodal error detection) — <https://arxiv.org/abs/2510.08580>
- Guitar-TECHS dataset — <https://arxiv.org/abs/2501.03720>
- Prior in-repo research: `research/agent-reports/01-commercial-products.md`, `02-open-source-and-papers.md`, `03-architecture-and-build-plan.md`
