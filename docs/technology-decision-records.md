# Technology Decision Records (ADRs)

> **Status:** Planning / architecture only. No application code yet.
> **Date:** 2026-07-02.
> **Companion docs:** [opus-stack-implementation-plan.md](opus-stack-implementation-plan.md) · [implementation-work-packages.md](implementation-work-packages.md) · [open-questions-and-research-gaps.md](open-questions-and-research-gaps.md)

Concise, ADR-style records of the load-bearing technology decisions behind the Opus stack plan. Each record is intentionally short: the decision, why, the alternatives that lost, and the trigger that would reopen it. Full rationale and tradeoff tables live in the stack plan (§3–§16); this doc is the quick-reference index of *what was decided and what would change it*.

**Legend — Status:** `Accepted` (committed for MVP) · `Provisional` (accepted but data-dependent) · `Deferred` (revisit at a named milestone).

---

## ADR-001 — Platform: Browser-first installable PWA

- **Status:** Accepted (MVP). Tauri desktop Deferred → Beta; native mobile Deferred → later.
- **Context:** The core loop is real-time multimodal perception (camera + mic + GPU inference) on a single-user machine. Need fastest speed-to-feedback and reuse of Michael's React/Vite/PWA muscle memory.
- **Decision:** Ship an installable **PWA** (Chromium primary; Safari 26 / iOS 26 now viable). All required web APIs — `getUserMedia`, Web Audio, AudioWorklet, WebGPU — are Baseline/stable in 2026.
- **Alternatives:**
  - *Tauri desktop* — best low-latency native audio (ASIO/CoreAudio) and long-session stability, but an extra build target with native-audio plumbing. **Defer to Beta** for pro-audio users.
  - *Electron* — huge ecosystem but heavy bundles and a weaker native-audio story than Tauri. **Rejected** unless a Node-only native dep forces it.
  - *Native mobile* — best camera ergonomics but highest build cost and hardest real-time-on-battery story. **Deferred**; phone becomes a capture/review companion first.
  - *Capacitor-wrapped PWA* — cheapest mobile path later; same engine perf ceiling. **Later.**
- **Consequences:** Accept browser audio-stack variance and user-dependent camera angle. Single main thread + GPU must be budgeted carefully (workers, §6 of plan).
- **Reopen trigger:** Web perception can't hit the <250 ms corrective-hint gate on the reference laptop → pull Tauri forward.

---

## ADR-002 — Frontend framework: React 18 + Vite 5 + TypeScript

- **Status:** Accepted.
- **Context:** Need a familiar, high-velocity UI stack; perception runs off the main thread, so framework runtime overhead is irrelevant to the hot loop.
- **Decision:** **React 18 + Vite 5 + TypeScript**, with **Zustand** for session/lesson/calibration/UI state. React 19 acceptable if a dependency requires it.
- **Alternatives:** *Svelte/SvelteKit* (leaner canvas story, new muscle memory, no net benefit here — deferred); *SolidJS* (niche, ecosystem gaps — rejected); *Redux* (overkill) and *React Context for hot state* (re-render churn wrong for 30 fps) — both rejected for state.
- **Consequences:** 30 fps perception state must **not** flow through React; it lives in workers + a module-level store read via `requestVideoFrameCallback` / `useSyncExternalStore`. React re-renders stay coarse (lesson step, target chord, aggregate confidence).
- **Reopen trigger:** Overlay/UX becomes GPU-shader-heavy enough that a leaner runtime measurably helps → revisit.

---

## ADR-003 — Overlay rendering: Canvas 2D via requestVideoFrameCallback

- **Status:** Accepted (MVP). WebGL/WebGPU overlay Deferred.
- **Context:** MVP overlay is chord diagrams, finger halos, R/Y/G string bars, and a fret grid — a modest draw budget that must land within the <100 ms perceived-latency target and align to decoded frames.
- **Decision:** **Canvas 2D** overlay composited over the `<video>` element, driven by `requestVideoFrameCallback`, drawn in an **OffscreenCanvas** worker where possible.
- **Alternatives:** *WebGL (PixiJS/regl)* — GPU-accelerated many-sprite overlays, more complexity than MVP needs (later if overlays get heavy); *WebGPU render* — future-proof, shares the device with inference, overkill now (roadmap); *SVG/DOM* — fine for static lesson chrome, bad for per-frame updates (use only for static chrome).
- **Consequences:** Watch for CPU-bound overdraw; keep the per-frame draw list small.
- **Reopen trigger:** Overlay overdraw shows up in the frame-time budget → move to WebGL.

---

## ADR-004 — Fretboard capture & calibration: ChArUco marker + OpenCV.js homography

- **Status:** Accepted (MVP). Markerless localization Deferred → data project.
- **Context:** The honest hard part is camera-space → fretboard-space mapping under occlusion, motion blur, and varied angles. Markers make the geometry tractable for MVP.
- **Decision:** **ChArUco clip-on board** → homography via **OpenCV.js** (Apache/BSD) mapping frames to normalized fretboard coordinates; plus a **manual 4-corner tap** fallback for users without a printed board. Capture is `getUserMedia` 720p/30fps + mono audio, with browser voice DSP (echo cancel / noise suppression / AGC) **disabled** — it hurts instrument analysis.
- **Alternatives:** *Plain ArUco* — less corner accuracy than ChArUco (rejected as primary); *learned markerless fretboard detector* — requires collected labeled frames, so **deferred** to the data lane (§13 of plan).
- **Consequences:** MVP requires a printed marker or manual calibration; markerless is explicitly not a weekend swap.
- **Reopen trigger:** Enough labeled webcam frames collected to train a license-clean markerless detector → open ADR for markerless localization.

---

## ADR-005 — Audio analysis stack: custom onset + Basic Pitch + CREPE + template chords

- **Status:** Accepted (MVP). Small CRNN chord model Deferred → Phase 1.
- **Context:** Need low-latency, license-clean audio perception on-device: onset/strum timing, polyphonic notes, monophonic tuner pitch, and open-chord classification.
- **Decision:**
  - **Onset/strum timing** — **custom AudioWorklet spectral-flux detector** (own DSP).
  - **Polyphonic note events** — **Spotify Basic Pitch** (Apache-2.0) via ONNX Runtime Web (WebGPU EP → WASM fallback); `basic-pitch-ts` as a convenience wrapper, not a maintained dependency.
  - **Monophonic pitch / tuner** — **CREPE via `onnxcrepe` + onnxruntime-web** (manual ONNX export step).
  - **Open-chord recognition** — **chroma/CQT → template match** against the expected chord set, including a `noise/silence/invalid` class.
- **Alternatives (rejected for shipping):** *Madmom* (CC BY-NC-SA models, unmaintained since 2018), *Essentia.js* (AGPLv3, stale), *aubio* (GPL) — all license-encumbered → **offline experiments only** (see ADR-011). YIN/pYIN DSP for pitch is simpler but less robust than CREPE.
- **Consequences:** Onset detection is owned DSP we maintain; CREPE requires a manual export step; Basic Pitch works best on solo guitar and must be chunked for near-real-time.
- **Reopen trigger:** Template chord accuracy plateaus below the 90% gate → train the Phase-1 CRNN on GuitarSet/Guitar-TECHS.

---

## ADR-006 — Vision analysis stack: MediaPipe Tasks-Vision HandLandmarker + geometric mapping

- **Status:** Accepted (MVP). Learned contact classifier Deferred → Phase 1.
- **Context:** Need real-time 21-point hand landmarks in-browser plus a debuggable fingertip → string/fret mapping. The classic `@mediapipe/hands` solution is now **Legacy**.
- **Decision:** **MediaPipe Tasks-Vision `HandLandmarker`** (Apache-2.0, WASM/WebGPU) for landmarks + handedness; a **deterministic geometric post-process** projects fingertips into the normalized fretboard (nearest string, fret cell, behind-fret distance, adjacent-string mute risk). Strum-hand direction from wrist-velocity heuristics. MediaPipe **Pose** + rules for optional posture (non-MVP).
- **Alternatives:** *Custom keypoint net* — data-hungry (rejected for MVP); *learned contact classifier* — better under occlusion but needs labeled data → **deferred to Phase 1**.
- **Consequences:** MediaPipe is not guitar-aware — the fretboard mapping is ours to own and tune. Deterministic first for debuggability.
- **Reopen trigger:** Geometric mapping F1 caps below the 85% fingertip→fret/string gate under occlusion → train the contact classifier.

---

## ADR-007 — Fusion engine: deterministic TypeScript state machine + confidence-weighted fusion

- **Status:** Accepted.
- **Context:** Vision alone can't tell if a fretted note rang; audio alone can't tell which finger muted it. Fusion is the differentiated core and must be debuggable and trustworthy.
- **Decision:** A **deterministic TypeScript state machine** consuming a **typed, confidence-carrying event schema** (audio + vision events → `Diagnosis`). **Confidence-weighted combination, not hard AND.** Feedback policy is **false-positive-averse**: one correction per 1–2 s, confidence-gated, ranked by confidence → pedagogical importance → benefit → non-repetition → actionability. **Lessons-as-data** (YAML/JSON) so content changes without redeploying the engine. The frontier model may only *propose* from a bounded taxonomy — it never overrides the R/Y/G loop.
- **Alternatives:** *End-to-end learned fusion* — opaque, data-hungry, and un-auditable for a trust-critical loop (rejected for MVP); *hard-AND rule fusion* — brittle under noisy confidence (rejected).
- **Consequences:** Fusion quality is bounded by upstream perception confidence calibration; requires per-bucket calibration testing (§16 of plan).
- **Reopen trigger:** Deterministic fusion can't get false-critical feedback under 5% → introduce a learned re-ranker behind the same taxonomy.

---

## ADR-008 — Coaching model: frontier multimodal on the slow path only

- **Status:** Accepted. Provider binding Provisional (see ADR-011).
- **Context:** Frontier round-trips are 300 ms–2 s+; they physically cannot close a sub-250 ms correctness loop. But they excel at explanation, ambiguity resolution, summaries, and drill generation.
- **Decision:** A **two-speed design**. Fast path (0–250 ms, 100% on-device) owns corrections. Slow path (0.5–2 s+, optional, backend) sends **structured events + 1–3 sparse keyframes** to a **frontier multimodal model** for the four coaching modes (conversational coach, ambiguity resolver, session summarizer, content generator). The model is **never** in the correctness loop; all feedback carries confidence; real-time-mode output is constrained to the bounded taxonomy. On-device rule engine + teacher-authored explanation templates are the default foundation and the graceful-degradation / **Local-only mode** path.
- **Alternatives:** *Frontier model in the hot loop* — violates the latency budget (rejected outright); *no frontier model, templates only* — viable fallback, weaker on open-ended "why does this sound bad?" (kept as fallback, not primary).
- **Consequences:** Requires the model proxy (ADR-010) and a hard cost cap; coaching quality gated by teacher-agreement eval (>75%).
- **Reopen trigger:** On-device explanation templates match frontier quality in teacher eval → drop the live model to optional.

---

## ADR-009 — Backend: thin FastAPI (Python); core loop is client-only

- **Status:** Accepted.
- **Context:** The real-time loop must not depend on a backend. But the model proxy, content service, and opt-in storage need a server, and the ML/eval research lane is Python (Basic Pitch, amt-tools, training).
- **Decision:** A **thin FastAPI (Python)** backend hosting: (1) the model proxy, (2) lesson + chord/fingering content, (3) opt-in clip/session storage, (4) the template-coach fallback. **HTTPS for content; WebSocket only for the coaching stream** — never the perception loop.
- **Alternatives:** *Node/NestJS* — matches Michael's TS comfort and gives one language across the stack, but re-implements or shells out for Python ML glue (viable alternative, recorded here); *Supabase Edge / serverless* — cold starts and awkward streaming, use only for simple content/CRUD; *Firebase Functions* — deepest muscle memory and reusable `fn-claude-proxy`/cost-cap patterns, but Node runtime reintroduces the Python-glue friction.
- **Consequences:** Slightly new backend territory for Michael (his app-backend precedent is JS/Firebase); the Python affinity with the model/eval lane is the deciding factor.
- **Reopen trigger:** No meaningful Python glue ends up on the server → an all-TS Node backend becomes the simpler choice.

---

## ADR-010 — Data layer: local-first IndexedDB (Dexie); optional Supabase sync later

- **Status:** Accepted (MVP local-only). Cloud sync Deferred → opt-in.
- **Context:** The data is biometric home video/audio; the app is single-user first. Privacy and object-heavy clip storage drive the choice.
- **Decision:** **Local-first.** **IndexedDB via Dexie** for sessions, calibration profiles, telemetry, and drafts. **Zod** validates at every write/read boundary (write gate + normalize at read). Chord library = **UCI Guitar Chords Finger Positions** (2,633 defs) + hand-authored lessons as static JSON. Optional **Supabase (Postgres + object storage, RLS per user)** for opt-in cross-device sync and clip upload **later**.
- **Alternatives:** *Firebase/Firestore* — great for multi-tenant SaaS and reuses McCallos infra, but this app is single-user, local-first, and clip storage is object-heavy → Supabase/Postgres + object storage is a cleaner fit and keeps VPS self-hosting open (Firestore recorded as a valid fallback if reusing McCallos infra wholesale).
- **Consequences:** No cross-device sync in MVP; clip upload is strictly opt-in.
- **Reopen trigger:** Multi-device or multi-user need arrives → stand up the Supabase sync layer (or Firestore if reusing McCallos infra).

---

## ADR-011 — Model provider binding & the license firewall

- **Status:** Accepted (firewall). Provider binding Provisional.
- **Context:** "Fable 5 Clubs" is a **placeholder**, not a confirmed shipping API — design to a capability contract, not a name. Separately, several strong OSS blocks carry licenses that cannot ship.
- **Decision (provider):** Bind coaching to a **capability contract** (streaming/near-real-time multimodal in; image/keyframe understanding; structured tool/JSON out; sub-2 s first token ideal; bounded per-session cost; opt-in privacy path). The **proxy abstracts the provider** so the model is swappable — concrete equivalents that satisfy most of the contract: Anthropic Claude / Fable-class, OpenAI Realtime, Google Gemini Live. *(Note: this environment lists `claude-fable-5` as a real ID, but "Fable 5 **Clubs**" specifically is unverified, so bind to the contract.)*
- **Decision (license firewall):** Ship an **MIT/Apache-2.0-clean core** (MediaPipe, Basic Pitch, ONNX Runtime, OpenCV). **Madmom** (CC BY-NC-SA models), **Essentia.js** (AGPLv3), and **Ultralytics YOLO/RT-DETR** (AGPL-3.0 — the license *travels with exported weights*) are **offline-experiment-only; never shipped**. A shippable fretboard detector must be trained from a **permissively-licensed base** (e.g. RT-DETR from PaddleDetection, Apache-2.0) or from scratch on our own data.
- **Alternatives:** *Hard-code one provider* — cheaper to build, but couples the app to an unverified name (rejected); *ship AGPL/NC blocks and "deal with it later"* — legal and relicensing risk baked into the artifact (rejected outright — this is the firewall's whole point).
- **Consequences:** A provider abstraction is mandatory in the proxy; every model dependency must pass a license check before it enters the shipped bundle (WP-0 gate).
- **Reopen trigger:** A named frontier model is confirmed to meet the full contract with acceptable cost → pin it as the default binding (proxy still abstracts alternatives).

---

## ADR-012 — Deployment, evaluation & privacy posture

- **Status:** Accepted.
- **Context:** Static client + thin backend + a research/training lane that needs GPUs the *app runtime does not*. Latency and false-feedback rate are product-critical and must be enforced, not aspired to.
- **Decision:**
  - **Build/host** — Vite static build → Michael's **VPS** (nginx) or Vercel/Netlify; FastAPI in **Docker** on the VPS; ONNX + WASM served as static assets with **COOP/COEP** headers for `SharedArrayBuffer`/threads.
  - **CI (GitHub Actions)** — typecheck, ESLint, unit tests, a **model-eval smoke** (fixed audio/vision fixtures → assert accuracy/latency deltas), bundle-size budget. **Latency budgets and eval thresholds are CI gates that fail the build on regression.** No secrets in the client.
  - **Evaluation gates (MVP acceptance)** — fingertip→fret/string ≥85%; open-chord classification ≥90% clean; strum-timing MAE <100 ms; false critical feedback <5%; teacher agreement >75%; corrective hint <250 ms on the reference laptop.
  - **GPU** — none required to *run* (WebGPU/WASM on-device); GPU is for the **research/training lane only** (cloud box or Colab).
  - **Privacy/security** — **local-first perception**, upload only opt-in clips/frames/anonymized telemetry, explicit **Local-only mode**. Model proxy carries McCallos hardening: server-owned key, prompt-injection defense, **hard cost-cap kill-switch** (an alert is not a cap), rate limiting, `maxInstances`. **Sentry** privacy-first: PII scrub, **masked** on-error replay (video/audio masked/omitted), no-leak ErrorBoundary. Biometric hand imagery and home audio are treated as sensitive — consent and deletion are first-class.
- **Alternatives:** *Latency/eval as dashboards, not gates* — regressions slip silently (rejected); *cloud perception* — cheaper client, but breaks the privacy posture and the latency budget (rejected).
- **Consequences:** Every model swap must ship with updated eval fixtures; the cost cap must be a real kill-switch, tested.
- **Reopen trigger:** Reference-laptop budgets prove unrepresentative of real hardware → recalibrate gates and the reference target.

---

## Decision index

| ADR | Area | Decision | Status |
|---|---|---|---|
| 001 | Platform | Browser-first PWA; Tauri Beta; mobile later | Accepted |
| 002 | Frontend | React 18 + Vite 5 + TS + Zustand | Accepted |
| 003 | Overlay | Canvas 2D via `requestVideoFrameCallback` | Accepted |
| 004 | Capture/calibration | ChArUco + OpenCV.js homography; manual-tap fallback | Accepted |
| 005 | Audio | Custom onset + Basic Pitch + CREPE + template chords | Accepted |
| 006 | Vision | MediaPipe Tasks-Vision HandLandmarker + geometric mapping | Accepted |
| 007 | Fusion | Deterministic TS state machine, confidence-weighted | Accepted |
| 008 | Coaching model | Frontier multimodal, slow path only | Accepted |
| 009 | Backend | Thin FastAPI (Python); client-only core loop | Accepted |
| 010 | Data | Local-first IndexedDB (Dexie); Supabase sync later | Accepted |
| 011 | Model/proxy + license | Capability-contract binding + license firewall | Accepted / Provisional |
| 012 | Deploy/eval/privacy | Static + Docker; CI eval gates; local-first privacy | Accepted |
</content>
</invoke>
