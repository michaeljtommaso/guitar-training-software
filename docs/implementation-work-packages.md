# Implementation Work Packages

> **Status:** Planning / architecture only. **No application code yet** — this doc defines *what to build in what order*, not the code.
> **Date:** 2026-07-02.
> **Companion docs:** [opus-stack-implementation-plan.md](opus-stack-implementation-plan.md) · [technology-decision-records.md](technology-decision-records.md) · [open-questions-and-research-gaps.md](open-questions-and-research-gaps.md)

The ordered build plan. Each work package (WP) has an explicit **scope**, **deliverables**, **verification gate** (the objective bar that must pass before the WP is "done"), **dependencies**, and **non-goals** (what is deliberately excluded to prevent scope creep). WPs are sequenced so each one de-risks the next; the differentiated core (fusion, WP-4) is deliberately reached only after both perception legs stand alone.

**Sequence at a glance:**

```text
WP-0  Foundation & license firewall
  └─ WP-1  Capture shell (camera + mic + workers)
        ├─ WP-2  Audio open-chord loop
        └─ WP-3  Vision + marker calibration
              └─ WP-4  Fusion + deterministic corrections   ← differentiated core
                    └─ WP-5  Slow-path coach (+ template fallback)
                          └─ WP-6  Data flywheel (capture + annotation)
                                └─ WP-7  Hardening & Beta (Tauri, sync)
```

Traceability: each WP references the governing ADRs in [technology-decision-records.md](technology-decision-records.md) and maps to the milestones in [`mvp-roadmap.md`](mvp-roadmap.md).

---

## WP-0 — Foundation & license firewall

- **Governing ADRs:** 002, 011, 012.
- **Scope:** Stand up the monorepo skeleton (per §17 of the stack plan), toolchain, CI, and — critically — the **license firewall** as an enforced gate, not a note.
- **Deliverables:**
  - Repo scaffold: `apps/web`, `services/backend`, `models/`, `data/`, `infra/`, `docs/`.
  - React 18 + Vite 5 + TS app that builds and serves an empty shell; FastAPI service that boots.
  - GitHub Actions CI: typecheck, ESLint, unit-test runner, bundle-size budget, and a **dependency-license check** that fails the build on any AGPL/NC/GPL dependency reaching the shipped client bundle.
  - Design-token module (two-layer CSS custom properties) + the **status-triad JS constants** (`--correct`/`--warn`/`--error`/`--uncertain`) mirrored for canvas use.
  - COOP/COEP headers configured for `SharedArrayBuffer`/threads.
- **Verification gate:** CI green on an empty app; the license check **provably fails** when a known AGPL package (e.g. Essentia.js) is added, and passes when removed. Dark-mode token flip works with zero per-component branches.
- **Dependencies:** none.
- **Non-goals:** any perception, any UI beyond a shell, backend endpoints beyond a health check, model proxy.

---

## WP-1 — Capture shell (camera + direct audio first + worker topology)

- **Governing ADRs:** 001, 003, 004 (capture half).
- **Scope:** Get clean camera and guitar audio streams into the right threads with the right settings, plus the overlay compositing surface — no analysis yet. Audio capture is **direct DI/interface first**, with external/built-in mic fallback.
- **Deliverables:**
  - `getUserMedia` device enumeration + a setup wizard: pick camera/audio input, prefer likely DI/interface devices, recommend a clip-on fretboard cam, live preview.
  - Video: 720p/30fps into `<video>`, driven by `requestVideoFrameCallback`.
  - Audio: `AudioContext` @ 48 kHz with echo cancellation / noise suppression / AGC **disabled**, routed to an `AudioWorkletNode` with a lock-free ring buffer.
  - Direct-capture setup: level meter, clipping/noise-floor check, open-string sanity check, selected input/gain/sample-rate/latency metadata stored with the session.
  - Worker topology: vision worker (OffscreenCanvas + WASM/WebGPU capability probe), audio worker, main-thread fusion/UI placeholder.
  - Canvas 2D overlay compositing correctly over the video (draws a static test grid).
- **Verification gate:** Sustained 30 fps preview with the overlay composited and **no main-thread jank**; audio ring buffer delivers frames to the audio worker with measured glass-to-worker latency logged; setup wizard prefers a connected interface/DI input when available and falls back to mic mode when not; WebGPU-vs-WASM path selected automatically with a working fallback.
- **Dependencies:** WP-0.
- **Non-goals:** landmark detection, pitch/onset detection, calibration math, any diagnosis.

---

## WP-2 — Audio open-chord loop

- **Governing ADRs:** 005.
- **Scope:** The full on-device audio perception leg for the 8 open chords, standing alone (visual-debug UI, no fusion).
- **Deliverables:**
  - Custom **AudioWorklet spectral-flux onset detector** (own DSP).
  - **Basic Pitch** via ONNX Runtime Web (WebGPU EP → WASM fallback), chunked for near-real-time polyphonic notes.
  - **CREPE (`onnxcrepe`)** monophonic path powering a **tuner** setup step.
  - **Chroma/CQT → template chord match** over {C, G, D, A, E, Am, Em, Dm} + `noise/silence/invalid` class.
  - String-level audio validation: derive expected pitch classes from a target fingering → missing / extra / muted.
  - Debug panel: live chord posterior, onset markers, detected pitches, timing offsets (IBM Plex Mono, `tabular-nums`).
- **Verification gate:** **Open-chord classification ≥90%** on clean solo-guitar input; **strum-timing MAE <100 ms**; tuner tracks a reference tone within tolerance; all runs within the audio-loop latency budget (~40–90 ms).
- **Dependencies:** WP-1.
- **Non-goals:** barre/other chords, songs/tabs, vision, fusion, the CRNN chord model (Phase 1).

---

## WP-3 — Vision + marker calibration

- **Governing ADRs:** 004, 006.
- **Scope:** The full on-device vision perception leg — landmarks plus the fretboard geometry — standing alone.
- **Deliverables:**
  - **MediaPipe Tasks-Vision `HandLandmarker`** in the vision worker (21 pts + handedness), WASM/WebGPU.
  - **ChArUco** board detection → **OpenCV.js** homography to normalized fretboard coordinates; **manual 4-corner tap** fallback.
  - Deterministic fingertip → string/fret mapping: nearest string, fret cell, behind-fret distance, adjacent-string mute risk.
  - Strum-hand direction from wrist-velocity heuristics.
  - Overlay: fret grid, finger halos, per-string R/Y/G bars driven by the mapping (still vision-only).
- **Verification gate:** **Fingertip→fret/string ≥85%** on the supported seated + marker setup; homography reprojection error within tolerance; vision loop within budget (~35–70 ms); graceful degradation when the marker leaves frame.
- **Dependencies:** WP-1 (parallelizable with WP-2).
- **Non-goals:** markerless localization, learned contact classifier, posture scoring, standing/moving play, multiple camera angles beyond the reference setup.

---

## WP-4 — Fusion engine + deterministic corrections (the differentiated core)

- **Governing ADRs:** 007, 008 (taxonomy boundary only).
- **Scope:** Combine the two perception legs into confidence-weighted diagnoses and the trust-preserving feedback policy. This is the product's value.
- **Deliverables:**
  - Typed, confidence-carrying **event schema** (audio + vision events → `Diagnosis`), Zod-validated at boundaries.
  - Deterministic **TS state machine**: current lesson step, target chord/notes, chord posterior, finger-placement posterior, onset history, timing offset, calibration confidence.
  - **Confidence-weighted fusion** (not hard AND) resolving the canonical cases (shape-close-but-note-missing; valid-alternate-fingering; late-strum preparation).
  - **Feedback policy:** one correction / 1–2 s, confidence-gated, false-positive-averse, ranked (confidence → importance → benefit → non-repetition → actionability).
  - **Lessons-as-data** loader (YAML/JSON) for the 8 open chords + transitions.
  - Structured session event log persisted to **IndexedDB (Dexie)**.
- **Verification gate:** **False critical feedback <5%** of lessons on the internal test set; per-confidence-bucket calibration error within tolerance; **end-to-end corrective hint <250 ms** on the reference laptop; a lesson can be edited as data and take effect with no engine redeploy.
- **Dependencies:** WP-2 **and** WP-3.
- **Non-goals:** any frontier-model involvement in the correctness loop; learned/end-to-end fusion; multi-user; adaptive difficulty beyond authored lessons.

---

## WP-5 — Slow-path coach + template fallback

- **Governing ADRs:** 008, 009, 011.
- **Scope:** The optional frontier coaching layer and its always-available on-device fallback, plus the backend that hosts them.
- **Deliverables:**
  - Thin **FastAPI** backend: **model proxy** (server-owned key, prompt-injection defense, token/cost caps, `maxInstances`, hard cost-cap kill-switch), content endpoints, opt-in clip/session storage.
  - **WebSocket** coaching stream carrying sparse structured events + 1–3 keyframes.
  - The four coaching modes (conversational coach, ambiguity resolver, session summarizer, content generator), output constrained to the bounded feedback taxonomy.
  - **On-device fallback:** local rule engine + teacher-authored explanation templates with slot filling; explicit **Local-only mode** toggle.
  - Provider abstraction behind the capability contract (ADR-011) — no hard-coded provider name in app code.
- **Verification gate:** **Teacher agreement on top feedback >75%**; the cost-cap kill-switch demonstrably halts spend when tripped (tested, not just alerted); **Local-only mode** delivers full corrections + template coaching with the network disabled; the frontier model is provably never in the correctness path.
- **Dependencies:** WP-4.
- **Non-goals:** real-time frontier inference in the hot loop; multi-provider live A/B; TTS/voice coach; content marketplace.

---

## WP-6 — Data flywheel (capture + annotation)

- **Governing ADRs:** 011 (license hygiene), 010 (storage).
- **Scope:** The proprietary multimodal data pipeline that unlocks markerless vision and the learned models — the moat, deferred until the loop is proven.
- **Deliverables:**
  - Internal **annotation tool** (`apps/annotation-tool`): synced video + waveform + spectrogram, frame stepping, fretboard-grid overlay, fingertip/string/fret reassignment, mistake-taxonomy tagging, confidence display for **active learning**.
  - Staged **capture protocol**: controlled scripted-error sessions → opt-in in-the-wild home sessions → hard-negative mining (low light, dark fretboards, blur, occlusion).
  - Storage formats: JAMS (music), COCO-style keypoints (vision), structured JSON (taxonomy); consent + deletion controls.
  - Public-data bootstrap ingested for eval hold-outs: GuitarSet, IDMT-SMT-GUITAR, Isolated Guitar Chords, Guitar-TECHS.
- **Verification gate:** A labeled internal set large enough to *train and evaluate* a first markerless-fretboard or contact-classifier candidate; every ingested/trained asset passes the license firewall; active-learning queue surfaces the highest-uncertainty clips first.
- **Dependencies:** WP-4 (needs a working loop to generate confidence signals); benefits from WP-5.
- **Non-goals:** shipping a markerless detector (that's a later ADR); crowd-sourced/public data collection; any non-permissively-licensed training base entering a shippable artifact.

---

## WP-7 — Hardening & Beta (Tauri, sync, observability)

- **Governing ADRs:** 001, 010, 012.
- **Scope:** Take the proven web MVP toward a robust Beta for serious users.
- **Deliverables:**
  - **Tauri desktop** target for low-latency native audio and long-session stability (ADR-001).
  - Opt-in **Supabase** sync (Postgres + object storage, RLS per user) for cross-device sessions and clip upload.
  - **Sentry** privacy-first: PII scrub, **masked** on-error replay (video/audio masked/omitted), source maps, no-leak ErrorBoundary; latency histograms + false-feedback-complaint metric.
  - Full model-eval smoke as a **CI gate** across all layers; documented reference-hardware target.
- **Verification gate:** All §16 acceptance metrics hold on both web and Tauri; Sentry replays contain **no** un-masked biometric media; opt-in sync round-trips without leaking data in Local-only mode; CI fails on any eval/latency regression.
- **Dependencies:** WP-5 (WP-6 runs in parallel and feeds later model work).
- **Non-goals:** native mobile apps; barre chords / songs / tabs; markerless shipping; multi-user accounts / social features.

---

## Cross-cutting non-goals (entire MVP)

These are excluded from **every** WP above and only revisited post-Beta:

- Barre chords, capo, alternate tunings, full songs/tabs.
- Markerless fretboard tracking in a shipped build.
- Native mobile apps (phone is a capture/review companion at most).
- Standing/moving play, multiple simultaneous camera angles, multi-user or social features.
- Any frontier model in the real-time correctness loop.
- Any AGPL/NC/GPL dependency in a shipped artifact.

---

## Dependency matrix

| WP | Depends on | Unblocks | Can parallelize with |
|---|---|---|---|
| WP-0 | — | WP-1 | — |
| WP-1 | WP-0 | WP-2, WP-3 | — |
| WP-2 | WP-1 | WP-4 | WP-3 |
| WP-3 | WP-1 | WP-4 | WP-2 |
| WP-4 | WP-2, WP-3 | WP-5, WP-6 | — |
| WP-5 | WP-4 | WP-7 | WP-6 |
| WP-6 | WP-4 | later model work | WP-5, WP-7 |
| WP-7 | WP-5 | Beta | WP-6 |
</content>
