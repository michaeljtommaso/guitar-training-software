# Morning Report — Overnight Run, 2026-07-03

Run of 2026-07-03, overnight, fully unattended. Fable 5 orchestrated; Opus built
the judgment-heavy work packages, Sonnet the mechanical ones; every work
package was independently reviewed by a separate Opus agent; ~20 subagents
total across the night.

## TL;DR

All 8 work packages (WP-0 → WP-7) are genuinely built, tested, and
review-passed. The app runs end-to-end: camera+mic capture → real MediaPipe
hand landmarks + ChArUco/manual calibration → real chord/onset/pitch DSP →
confidence-weighted fusion with trust-preserving hints → local-only coach.
**No ML accuracy gate has been measured** — every number produced tonight is
synthetic or fake-device, and it's labeled as such everywhere it appears. The
single biggest thing between you and a validated MVP is one real capture
session.

## What is genuinely done (with proof)

| WP | Commit | Real evidence |
| --- | --- | --- |
| WP-0 — Foundation & license firewall | 32815c3 + d128324 | License firewall proven fail-closed: `essentia.js` (a real, AGPL-3.0-licensed npm package) trips the **name-denylist** path regardless of its declared license, and a battery of real SPDX identifiers (`AGPL-3.0-only`, `GPL-2.0-or-later`, `LGPL-2.1`, `SSPL-1.0`, `CC-BY-NC-4.0`, `BUSL-1.1`, …) trips the **license-expression** path — both unit-tested in `scripts/license-rules.test.mjs`. Live run tonight: `license-check: PASS — 94 production package(s) in apps/web bundle, all licenses cleared`. CI skeleton, design tokens, COOP/COEP headers all in place. |
| WP-1 — Capture shell | f9004ca | SAB ring buffer (torn-read-safe, RT-safe, reviewer-audited). Fake-device e2e, re-run live tonight: 41 rVFC ticks/2s, 762 audio frames read, 0 dropped, glass-to-worker ~6 ms (observed range ~4-7 ms across runs). |
| WP-2 — Audio open-chord loop | fbcb7f1 | Own spectral-flux onset detector — re-run live tonight, logged **1.3 ms** timing error on the synthetic single-pluck fixture; chroma templates got 8/8 synthetic open chords correct; YIN tuner holds pure tones within <5 cents (unit-enforced). REAL `@spotify/basic-pitch` model running in-browser via TF.js (transcribes a synthetic A2 pluck correctly). |
| WP-3 — Vision + marker calibration | d87ae98 | REAL MediaPipe HandLandmarker running in-browser: 21 landmarks, confidence 0.936 on a sample hand photo. ChArUco genuinely wired via OpenCV 5's real `aruco_*` bindings — re-run live tonight: 12/12 synthetic corners detected, reprojection error <0.02 (normalized units). Equal-tempered fret geometry unit-proven. Manual 4-corner DLT fallback also in place. |
| WP-4 — Fusion engine | 0aa7ec0 + fix a0d9a35 | Deterministic pure fusion engine (purity test-enforced), three canonical §9.2 cases proven at the engine level, false-positive-averse + rate-limited feedback policy. **Caught tonight:** the reviewer found a real three-clock topology bug — vision timestamps were biased seconds low, which silently degraded fusion to audio-only. Fixed via wall-clock (`Date.now()`) anchor bridging between legs. Cross-leg fusion is now proven live in e2e (dual-evidence diagnoses observed in every run, count varies run-to-run — 9-11 — under rate limiting and headless timing jitter). |
| WP-5 — Slow-path coach | e5d8f7f | Hardened proxy: kill-switch pre-flight + sqlite-persisted (proven to survive a process restart), prompt-injection fencing, taxonomy-bounded output validation with template fallback, key hygiene test-enforced, coach↔fast-path isolation test-enforced. Local-only mode is DEFAULT ON with a zero-network proof. Live WebSocket e2e ran end-to-end on a clearly-labeled FakeProvider. 42 backend tests, all green (re-run tonight). |
| WP-6 — Data flywheel | 6382532 | Annotation tool complete: video/waveform/spectrogram sync, frame stepping, 4-corner fretboard grid, fingertip/taxonomy tagging, active-learning queue, consent + deletion with receipts. JAMS/COCO/taxonomy schemas round-trip-tested. GuitarSet (CC-BY-4.0) really downloaded — 696 MB, sha256-verified — into gitignored `data/eval/`. IDMT-SMT-GUITAR honestly skipped (NC-licensed + form-gated distribution). |
| WP-7 — Hardening & Beta | 5a987a1 | Sentry wired privacy-first: DSN-gated (unit-enforced that no import/init/network happens without `VITE_SENTRY_DSN`), scrubbing + masked session replay + a no-leak ErrorBoundary, all unit-proven. Latency histograms and a "tip was wrong" complaint metric landed in the fusion store. eval-smoke CI regression gate added and re-run live tonight (green); it was independently proven to fail red by the reviewer before being accepted. Reference-hardware doc authored. Tauri and Supabase honestly not started (no Rust toolchain, no Supabase credentials on this machine). |

Cross-checked tonight, independent of the subagent reports: re-ran the full
web + annotation-tool test suite (**158 + 60 = 218 tests**, 1 intentional skip),
the full backend suite (**42 tests**), `license-check` (**94 packages, clean**),
`check-bundle-size` (**114.59 KB gz initial / 250 KB budget**), `eval-smoke`
(green), and two of the five e2e specs live with fake devices. All numbers
match what's in `PROGRESS.md` and `BLOCKERS.md`.

## What is partial / stubbed / deferred (the honest list)

- **All §16 accuracy gates are unmeasured**: ≥90% chord accuracy, ≥85%
  fingertip accuracy, <100 ms strum-timing MAE, <5% false-critical rate, >75%
  teacher agreement, <250 ms glass-to-glass hint latency. Every number
  produced tonight is synthetic-fixture or fake-device, and it's labeled that
  way at the point of measurement.
- Basic Pitch runs via `@spotify/basic-pitch` (TF.js), not the originally
  planned `onnxruntime-web` WebGPU path — that needs a validated ONNX export
  first. The tuner is the team's own YIN DSP, not CREPE — that also needs a
  manual ONNX export step.
- Live frontier coaching was never exercised — no API key was available.
  FakeProvider proves the WebSocket/streaming plumbing only.
- The backend Dockerfile was authored but never built (no Docker on this
  machine). Tauri desktop target not started (no Rust/cargo). Supabase sync
  layer not started (no project/credentials). Sentry is wired but has never
  fired at a real DSN. The CI YAML has never run on an actual GitHub runner
  (no `gh` CLI, nothing was pushed tonight).
- Sustained 30 fps / no-jank capture behavior and real-camera behavior in
  general have never been seen by a human — only by Chromium's fake camera
  in headless e2e.

## Every blocker + the human action

Straight from `BLOCKERS.md`, prioritized:

1. **Do the first real capture session.** Nothing below this line can move
   until real data exists — see "the single most important decision."
2. **No frontier API key** (WP-5): set `ANTHROPIC_API_KEY` server-side, smoke
   one live streamed turn, then run the teacher-agreement eval.
3. **Teacher-agreement gate (>75%) unmeasured** (WP-5): recruit 2-3 guitar
   teachers, run the eval per §16.
4. **Trainable labeled set doesn't exist** (WP-6): execute
   `data/capture-protocol.md` stage 1 (controlled, scripted-error sessions),
   label it in the annotation tool.
5. **Fingertip accuracy gate unmeasured** (WP-3): do a seated + ChArUco
   capture session, measure the ≥85% gate for real.
6. **Audio accuracy gates unmeasured** (WP-2): record/eval on GuitarSet plus
   home-mic clips before claiming ≥90% chord accuracy or <100 ms MAE.
7. **False-critical <5% + calibration gates unmeasured** (WP-4): record and
   label real lesson sessions (using WP-6 tooling), then measure.
8. **<250 ms hint gate not glass-to-glass** (WP-4): headless e2e can't see
   glass — measure on the reference laptop with a real camera/mic.
9. **Sustained-30fps + no-jank gate unverifiable headless** (WP-1): run
   `pnpm --filter ./apps/web dev` with a real webcam and confirm 30 fps
   preview, no jank, by eye.
10. **Basic Pitch ORT path deferred** (WP-2): export/validate an ONNX model,
    re-add `onnxruntime-web`, wire the WebGPU execution provider.
11. **CREPE tuner deferred** (WP-2): run the CREPE ONNX export, swap it in
    behind `TunerSource`.
12. **WP-7 §16 gate unmeasurable** (WP-7): ratify a reference laptop
    (`infra/reference-hardware.md`), measure §16 on web, then repeat on Tauri.
13. **Sentry never exercised against a live DSN** (WP-7): set
    `VITE_SENTRY_DSN` in a real project, confirm masked on-error replay
    contains no un-masked biometric media.
14. **e2e job not yet run on a GitHub runner** (WP-7): push to GitHub,
    confirm the e2e job goes green on `ubuntu-latest`, then promote it to a
    required check.
15. **Tauri desktop target not built** (WP-7): install Rust + `tauri-cli`,
    scaffold `apps/desktop` pointing at the web build, re-run §16 gates on
    desktop.
16. **Supabase sync layer not built** (WP-7): create a Supabase project +
    keys, build the opt-in sync layer, prove it round-trips without leaking
    in Local-only mode.
17. **IDMT-SMT-GUITAR not fetched** (WP-6): NC + form-gated — only pursue via
    the Fraunhofer form if wanted for offline eval, and never ship anything
    derived from it.
18. **Docker missing on the build machine** (WP-5): install Docker Desktop to
    validate the backend container build.
19. **`gh` CLI missing** (WP-0): push to GitHub and confirm Actions run
    green — CI steps were only mirrored as local commands tonight.
20. **docs §9.4 string-numbering inconsistency** (WP-4): the lesson example
    in `docs/opus-stack-implementation-plan.md` (`avoid_strings: [1]`)
    contradicts its own fingerings under the standard convention. Resolved
    code-wide to standard (1 = high e); the docs example itself still needs a
    human fix.
21. **corepack EPERM** (WP-0): cosmetic only — pnpm was installed via
    `npm i -g pnpm` instead. No action needed.

## How to see it work

```
pnpm install
pnpm --filter ./apps/web dev   # -> http://localhost:5173 (allow camera+mic;
                                #    wizard -> Start capture -> tuner/lesson/coach panels)

# full verification suite:
pnpm typecheck && pnpm lint && pnpm test
pnpm build && node scripts/check-bundle-size.mjs && node scripts/check-licenses.mjs
pnpm eval-smoke
pnpm --filter ./apps/web e2e   # headless proof with fake devices

# backend (optional, coach over WebSocket):
cd services/backend
.venv\Scripts\Activate.ps1
$env:COACH_PROVIDER = "fake"
uvicorn app.main:app --port 8000

# backend tests (from services/backend, venv active):
python -m pytest -q

# annotation tool:
pnpm --filter ./apps/annotation-tool dev
```

(Note: there is no root-level `pnpm dev` — the root `package.json` only
exposes `typecheck`/`lint`/`test`/`build`/`bundle-size`/`license-check`/
`eval-smoke`; `dev` lives in each app's own `package.json`, hence the
`--filter` above.)

## The single most important decision

**Do the first real capture session this week.** Print a ChArUco board (5×4,
`DICT_4X4_50` — the spec is in the WP-3 code), sit down with the guitar, and
record the 8 open chords with deliberate scripted mistakes per
`data/capture-protocol.md`. Label it in the annotation tool. Every deferred
gate above hangs on this real data, and it's the decision point for the two
biggest architecture reopeners: template-matcher vs. CRNN for chord
recognition, and geometric mapping vs. a learned contact classifier for
fingertip→fret. Until this happens, the MVP is plumbing-proven but
accuracy-unknown.

## Footnote — run integrity

Two session-limit interruptions (during WP-2/3 integration and during WP-7)
were resumed cleanly, with all gates re-verified afterward. Three subagent
spawns returned empty on their first attempt (a harness glitch) and were
re-dispatched successfully. The `docs/` planning files were never modified by
the build itself — one docs inconsistency was found (the §9.4 string
numbering above), resolved in code to the standard convention (1 = high e),
and left documented here for a human docs fix.
