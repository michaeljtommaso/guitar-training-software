# Phase 0 — Findings Log

> First real-world run of the app (built but never hardware-tested). We walk the
> flow, record every bug / rough edge here, then batch-fix. Newest findings appended.
> Started 2026-07-06. Tester: Michael. Environment: Windows 10, Chrome/Edge, built-in
> mic (no interface yet — `mic · fallback` mode).

---

## BUG-001 — False onsets, phantom chords, and phantom tuner reading on silence

**Severity:** High (core audio perception looks broken on an idle/quiet input)
**Status:** Diagnosed, not yet fixed (batch-fix later)
**Repro:** Start capture on the built-in mic, play nothing. `onset` counter climbs
continuously (observed 1647), the chord posterior bars dance across chords, and the
tuner shows a phantom reading (`E2 · 85 Hz +54.2¢`) — all with no input played.

**Root cause (single shared gap):** the browser's noise-suppression/AGC is
deliberately disabled (ADR-004) so the analyzer gets a clean signal, but only the
**chord matcher** was given a loudness (RMS energy) gate. The onset detector, the
posterior display, and the tuner have **no energy gate**, so they all react to the
raw mic noise floor.

Evidence (code):
- `apps/web/src/perception/audio/dsp/onset.ts:79` — onset threshold is purely
  relative (`median(flux) * 1.6 + 1e-4`); in silence the median → ~0, so the tiny
  `1e-4` floor is cleared by noise flicker → onsets fire continuously.
- `apps/web/src/perception/audio/analysis.ts:77` vs `:90` — the chord path receives
  `rms` (loudness) and gates on it; the onset path receives no level at all.
- `apps/web/src/perception/audio/dsp/chords.ts:83-93` — `classifyChroma` computes the
  full 8-chord posterior on every frame even when the gated label is `silence`, and
  `apps/web/src/capture/AudioDebugPanel.tsx:37-50` renders those bars unconditionally
  → a confident-looking chord spread over pure noise. (Note: the bar numbers are
  posterior *percentages*, not counts — they are not accumulating.)
- Tuner (`dsp/tuner.ts`, `YinTunerSource`) also has no energy gate → locks onto
  low-frequency hum (~85 Hz ≈ noise floor).

**Fix plan (test-first):**
1. Gate onset emission/count on frame RMS below the silence floor (reuse the chord
   matcher's `silenceRms`, default 0.005). Failing test: feed silence → assert 0 onsets.
2. Suppress/grey the posterior bars when label is `silence`/`noise`.
3. Suppress the tuner reading below the silence floor.
4. Caveat: the exact silence threshold wants tuning against the real mic and (later)
   the interface noise floor — finalize the number during Phase 1 hardware testing.

**Positive note from the same session:** with real playing, chord detection was
accurate (correctly identified E minor repeatedly) — the detector works; it just
needs the silence gate.

---

## BUG-002 — Vision worker dead in dev: no hand tracking, no fret dots

**Severity:** Critical (the entire vision leg — hand tracking, fret/finger overlay,
the headline UX moment — is offline whenever the app runs via `pnpm dev`)
**Status:** Root cause CONFIRMED (console error), not yet fixed
**Repro:** Start capture. Webcam video displays fine, but `Vision frames` stays at 0
and no target dots ever appear, even after starting a lesson. Console shows:
```
visionWorker.ts?worker_file&type=classic:3
Uncaught SyntaxError: Cannot use import statement outside a module
```

**Root cause:** `apps/web/src/capture/controller.ts:194` creates the vision worker as
a **classic** worker (`{ type: "classic" }`) because MediaPipe's HandLandmarker loads
its wasm via `importScripts`, which only exists in classic workers. But
`apps/web/src/perception/vision/visionWorker.ts` is authored with ESM `import`
statements. In a **production build** Vite bundles those imports into a classic IIFE
(works). In **dev** (`pnpm dev`) Vite serves the worker file raw as
`?worker_file&type=classic`, and the browser rejects the ESM `import` → the worker
throws on load and never runs. `framesReceived` (visionWorker.ts:91) therefore never
increments, no `visionFrame`/`visionStats` messages are sent, the overlay gets no
hands, and no dots are drawn. There is also **no `visionWorker.onerror` handler** in
controller.ts, so the failure is completely silent to the user.

Why tests didn't catch it: the e2e suite runs against a production build (or preview),
where the worker is bundled and works. The dev-only path was never exercised — this
is the first real `pnpm dev` run.

**Fix direction (needs its own verify cycle — do NOT assume a one-liner):**
- Make the vision worker load correctly in BOTH dev and build. Candidate approaches,
  to be tested: (a) convert to a module worker (`type: "module"` + `worker.format:
  "es"` in vite.config) IF the installed `@mediapipe/tasks-vision` version supports
  module workers (older versions failed with "ModuleFactory not set" — the reason
  classic was chosen; must verify current version); or (b) keep it classic but force
  Vite to bundle it in dev too. Whichever path, verify `Vision frames` climbs > 0 in
  dev before calling it fixed.
- Add a `visionWorker.onerror` handler that surfaces load failures to the UI/console
  instead of failing silently (defense-in-depth — this bug hid for a reason).

### Fix attempts (2026-07-06) — NOT yet resolved, paused after 2 attempts

**Attempt 1 — module worker + `worker.format: 'es'`.**
Changed the vision worker to `{ type: "module" }` (like the audio/notes workers) and
set `worker: { format: "es" }` in vite.config.ts. Added a `visionWorker.onerror`
handler. Typecheck + `pnpm build` passed.
- Result: the original `Cannot use import statement outside a module` load error was
  FIXED — the worker loads and runs. But a NEW, deeper error surfaced:
  `HandLandmarker init failed: Failed to fetch dynamically imported module:
  .../models/mediapipe/wasm/vision_wasm_internal.js?import`.

**Attempt 2 — classic worker via `?worker` import (reverted format to default iife).**
Reasoned that MediaPipe's Emscripten wasm glue (`vision_wasm_internal.js`) is not an
ES module and wants a classic worker, so switched to
`import VisionWorker from "...visionWorker.ts?worker"` (Vite bundles it as a
self-contained CLASSIC worker in dev AND build) and removed `worker.format: 'es'`.
Typecheck + `pnpm build` passed (`✓ built in 12.57s`).
- Result: worker still loads (load error stays fixed), but the **SAME**
  `vision_wasm_internal.js?import` fetch failure occurs. Vision frames still 0.

**What the two attempts prove (refined root cause):**
Both module and classic workers hit the *identical* wasm-loader fetch failure, so the
worker TYPE is NOT the remaining blocker. The real remaining problem is narrower:
**Vite's DEV server will not serve MediaPipe's wasm loader to a runtime `import()`.**
MediaPipe's `FilesetResolver.forVisionTasks("/models/mediapipe/wasm")`
(handLandmarker.ts:21) loads `vision_wasm_internal.js` via a runtime dynamic import;
Vite dev intercepts it, appends `?import`, and fails — the file lives in `public/` and
is Emscripten glue, not part of Vite's module graph. This is a **dev-server asset-
serving problem, not a worker problem.**

**Important:** the production build almost certainly works — status.md WP-3 records
"REAL MediaPipe HandLandmarker in-browser" and e2e is green, which run against a
build/preview, not `vite dev`. So the vision leg is likely fine in `pnpm build` +
`pnpm --filter web preview`; it is specifically `vite dev` that breaks. (Untested this
session — worth confirming: run preview and check Vision frames climbs.)

**Next hypotheses to try (attempt 3+, later):**
1. Confirm `vite preview` (production build) serves the wasm and vision works — if so,
   we have a working path immediately and the dev fix is a convenience, not a blocker.
2. Make Vite dev serve `/models/mediapipe/wasm/*.js` as a raw static asset that
   dynamic `import()` can fetch (candidates: move the wasm out of `public/` and import
   the loader via `?url`; a small dev-only middleware/plugin; `optimizeDeps.exclude`
   or `assetsInclude`; or serving the wasm dir outside Vite's transform).
3. Check whether a newer/different `@mediapipe/tasks-vision` loading API avoids the
   runtime `import()` of the glue in dev.

**Current code state:** left in the Attempt-2 configuration (classic `?worker` import +
`onerror` handler, default worker.format). This is strictly better than the original
(worker now loads instead of dying at parse; build + typecheck green) but the vision
leg is still non-functional in `vite dev` pending attempt 3.

---

## BUG-003 — Basic Pitch notes worker crashes: `window is not defined`

**Severity:** Medium (polyphonic note detection dead; `Notes: — bp 0`. Does not
affect the chord/tuner/onset loop, which is isolated by design.)
**Status:** Root cause identified (console error), not yet fixed
**Repro:** Start capture. Console shows:
```
@spotify_basic-pitch.js  Uncaught (in promise) ReferenceError: window is not defined
    at PlatformBrowser.setTimeoutCustom ... evaluateModel
    ... basicPitchSource.ts:39 ... notesWorker.ts
```

**Root cause:** `@spotify/basic-pitch` runs on TensorFlow.js, whose browser platform
(`PlatformBrowser.setTimeoutCustom`) calls `window.setTimeout`. The notes detector
runs inside a Web Worker (`apps/web/src/perception/audio/notes/notesWorker.ts`), where
the global is `self`, not `window` — so TF.js throws when it evaluates the model.
Detection dies; no note events are produced.

**Fix direction (needs verify cycle):**
- Provide a `window` alias in the worker global before TF.js loads (e.g.
  `globalThis.window ||= globalThis` shim at the top of the notes worker), or select a
  TF.js backend/config path that doesn't touch `window`. Verify `bp` count climbs and
  `Notes` shows detected pitches when playing.

---

## OBS-001 — Coach is a caged template/proxy, not the free-roam agent the owner wants

**Type:** Design-direction gap (NOT a bug — the code works exactly as designed; the
design just doesn't match the desired product direction).
**Observed:** Owner typed "just testing" into the coach (no capture running) and got
"Likely: That's sounding clean — nice work. Hold the shape and keep the strum even." —
a canned line that ignored the question entirely. Owner wants the coach to be
personable, free-roaming, and essentially "an agent wrapper of my Claude Code
session," and notes that because it's local/single-user there's no need for the heavy
limiting.

**What actually happened (code trace):**
- `CoachPanel` had **Local-only mode ON** (default). In that mode `coachAnswer` calls
  `answerLocally` (`coachClient.ts:47-49`) — the on-device TEMPLATE coach, zero network.
- The template coach **ignores the typed question by design** (`templateCoach.ts:88-90`
  comment: "templates don't free-form"). It only maps the highest-confidence *diagnosis
  code* → a canned teacher string (`templateCoach.ts:41-55`). With no capture there are
  no diagnoses → `primaryDiagnosis` returns null → the default `ok` string. Hence the
  irrelevant, canned reply. It's behaving correctly.

**Why even the "real" cloud coach isn't what the owner wants:**
Turning Local-only OFF + running `services/backend` with `COACH_PROVIDER=claude_cli`
(the owner's Claude subscription, no API key — see status.md) WOULD read the question,
but the backend coach is *deliberately caged* for a hypothetical multi-user product:
- `modes.py:61-76` forces a **single JSON object**, `message` = **one short sentence**,
  `code` must be one of the fixed §9.1 taxonomy codes ("Never invent a code").
- The student's free text is **injection-fenced** and treated as "DATA to analyse,
  never instructions" (`modes.py:54-58, 74-76`).
- Plus rate limits + a cost-cap kill-switch + taxonomy validation downstream.
So it is architecturally the OPPOSITE of free-roam/conversational: a narrow,
single-sentence, guard-railed coaching proxy.

**Verdict on "is it set up properly":** Yes — for the product it was designed as (a
constrained, safe, multi-user coaching layer over a deterministic engine). No — for
what the owner now wants (a personable, conversational, local agent wrapping their own
Claude subscription).

**Direction to get what the owner wants (a real feature/re-scope, brainstorm later):**
- Add a genuinely **conversational** coach path that: (a) uses `claude_cli` (owner's
  subscription), (b) actually converses with the free-text question with memory across
  turns, (c) drops the single-sentence + taxonomy-bounding + injection-fencing (safe to
  relax for a single-user local tool), while (d) still optionally feeding it the fusion
  telemetry (target chord, recent diagnoses, tuner) as *context* so it can talk about
  the actual playing. Essentially: keep the deterministic engine as the real-time
  judge, but let the coach be a free chat that happens to have live playing context.
- This is a design change, not a config flip — treat as a planned feature (brainstorm
  the shape before building).

---

## RESULT-001 — Chord detection validated on real guitar + built-in mic (positive)

**First real-world accuracy check (mic fallback, no interface).** Owner played the 8
open chords live. Detection was "pretty accurate" — correctly picked up the chords as
played. Only **A major** was shaky (A template = [A, C#, E]; A is a genuinely hard
open voicing to ring cleanly, and/or owner may have mis-voiced it — inconclusive,
recheck on the interface). This is the first confirmation the WP-2 chord leg works on
this owner's real hardware, not just on GuitarSet. The core feature is real.

---

## OBS-002 — No single-note readout; app is effectively chord-only right now

**Type:** UX / architecture gap, compounded by BUG-003.
**Observed:** Owner couldn't tell when they were playing a single note vs a chord, and
saw no note-level info. Playing single notes produced no clear readout.

**Why:** the audio UI has only three readouts, and note-level is the dead one:
- **Chord matcher** (`chords.ts`) always forces the input into one of the 8 open chords
  (or silence/noise) — so a single note still gets labeled as its nearest chord, which
  is misleading.
- **Tuner** (`tuner.ts`) shows a single pitch + cents — the closest thing to note
  feedback, but it reads as "tuning," not "you played note X."
- **Basic Pitch notes** (the actual per-note detector) is **offline (BUG-003)** — so
  the one component meant to say "you played these notes" produces nothing.

Net effect: with notes dead, the app is **chord-only**. There is no clear "single note
vs chord" distinction, and no note-name feedback for single-note practice.

**Also observed:** owner saw no feedback on *which notes/strings* they were struggling
with. That per-string mistake feedback (wrong_string, muted_string, etc.) depends on
BOTH the notes detector (BUG-003) AND the vision/fingering leg (BUG-002) feeding the
fusion engine. With both dead, mistake diagnosis is currently limited to whole-chord
level. → Fixing BUG-003 (and later BUG-002) is the prerequisite for note-level and
per-string coaching; a clearer "note vs chord" UI mode is a follow-on design item.

---

## RESULT-002 — Lesson flow test: scaffolding works; three problems surfaced

**Test:** Started the "E minor (open)" lesson and played Em. Screenshot evidence.

**✅ Positive — lesson engine is structurally alive:** entered lesson state; showed
Target `Em` with correct fingering (`middle→A f2`, `ring→D f2`); rendered per-string
chips (low E / A / D / G / B / high e); produced hints; a "Tip was wrong" feedback
button is present; telemetry works (`Fusion: diag 109 · hints 7 · dropped 0`,
`Latency: hint p50 0.1ms · p95 0.2ms · complaints 0/7`).

**Problem 1 — BUG-001 poisons the FUSION/LESSON layer, not just the audio panel.**
`diag 109 · hints 7` accrued largely while NOT playing: the missing silence gate lets
mic noise generate real diagnoses and hints inside a live lesson (e.g. the phantom
"Missing a note" hint below). This raises BUG-001's severity — it manufactures false
coaching, not just a bad debug readout. Silence gate must also gate fusion ingest.

**Problem 2 (NEW, but a KNOWN limitation) — E vs Em confusion.** Playing Em, the audio
panel frequently showed **E**, and Em confidence stayed low. Root cause: E = [E,G#,B]
vs Em = [E,G,B] differ by exactly ONE pitch class (G# vs G, the third) — the hardest
major/minor call for a chroma template-matcher. `docs/status.md` already lists "Em→E"
as a top GuitarSet confusion, so this is a reproduced, documented weakness, not a
regression. The softmax splits probability across E/Em → low Em %. This is exactly the
ceiling the planned **Phase-1 chord CRNN (Q-04)** targets; templates cannot cleanly
separate one-note-apart major/minor. NOT a quick fix — it's the model-upgrade lane.

**Problem 3 — hint/panel disagreement: hint said "hearing: C" while panel showed E.**
The Em lesson hint read "Likely: Missing a note — target chord Em not heard (hearing:
C)" while the audio perception panel showed E at that time. Likely a BUG-001 artifact:
the fusion diagnosis sampled a silence/noise instant whose noise-posterior favored C.
Re-verify after the silence gate lands — if it persists, investigate the chord source
the fusion diagnosis reads vs what the panel displays (possible stale/mismatched read).

**Also:** per-string chips all `—` (no per-string status) because vision/fingering is
dead (BUG-002) — expected.

---

## RESULT-003 — Tone/amp engine works end-to-end (positive) + quality ceiling notes

**Test:** Plugged in headphones, ran capture on built-in mic, set Monitor → Amp,
adjusted controls. Screenshot evidence.

**✅ Positive — the whole Web Audio tone chain is functional:**
- Audio came through the headphones; Monitor → Amp produced processed sound.
- Every control audibly changed the tone: Trim, Gate, Drive, Bass/Mid/Treble/Presence,
  Volume. Gate at −30 dB noticeably cut the noise/crunch between notes.
- Clean DI (raw mic) vs Amp (processed) both worked and were distinguishable.
- The mic-feedback warning fired correctly ("Mic input + speakers can feedback — use
  headphones"). Feedback guard logic verified.
- No crashes, no console errors reported.

**Quality ceiling (NOT a bug — input-bound):** tone was "crunchy," not product-quality.
Two input-side causes, both resolved by the interface, neither a DSP defect:
1. **Mic input, not a DI.** The mic captures acoustic guitar + room noise (broadband,
   noisy); pushing Drive distorts the noise → crunch. Amp sims expect a clean electric
   pickup DI. This is the fundamental ceiling — same engine, clean input = musical.
2. **Latency `52.0 ms output path`** (from screenshot) — high enough to feel a slapback
   while playing. This is the browser mic path (WASAPI shared). An ASIO interface drops
   it to ~5–10 ms. So the interface fixes BOTH tone cleanliness and latency.

**Cheap partial improvements without an interface (candidates, not committed):**
stronger noise gate; an input high-pass/low-pass to cut rumble/hiss before Drive; a
dedicated "mic mode" tone profile (less gain, more filtering) tuned for acoustic-in.
Real fix = the ~$50 Hi-Z interface (M-Track Solo). The amp engine is proven; it is
currently being judged unfairly on a mic.

---

## IDEA-001 — Signature / artist tones as a feature (product direction)

**Owner idea:** ship selectable artist/signature tones (e.g. Harrison, Richards-style),
like some amp-sim libraries do, so users can pick tones they want.

**Feasibility — the architecture already supports the cheap tier:**
- A "signature tone" = a bundled **preset** (drive/EQ/gate values) + a matching
  **cabinet IR**. The app already has a presets dropdown (`tone/presets.ts`) and
  runtime IR loading (`TonePanel` → `tone.loadIR`, `.wav`). So curated tone presets are
  a small additive feature, not a rebuild.
- **Authentic tier:** `docs/status.md` already defines a deferred **NAM / native tone
  lane (TP-4)** — Neural Amp Modeler. NAM captures (large free community + IR packs) are
  how modern sims reproduce real artist rigs. That lane is where true "sounds like that
  rig" fidelity comes from.

**Caveat to respect — the license firewall (CC0/CC-BY only):** artist *names* carry
trademark/licensing weight and some capture/IR packs are commercial. Shipping the
*settings* that approximate a tone is fine (an EQ curve isn't copyrightable); naming a
preset after a living artist needs care. Build from freely-licensed captures/IRs.

**Status:** logged as product direction; brainstorm shape before building. Related:
finish TP-3 (pedalboard) / TP-4 (NAM) tone lanes per the tone work-packages plan.

