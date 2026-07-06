# Project Status

> **Snapshot:** 2026-07-06.
> **Merged from** the overnight-run morning report (2026-07-03) and the build progress log (`PROGRESS.md`, retired), cross-checked against the living [`blockers.md`](blockers.md) ledger.
> **Companions:** [testing.md](testing.md) (how to verify all of this) · [plans/direct-capture-and-tone-work-packages.md](plans/direct-capture-and-tone-work-packages.md) (next build plan).

## 1. At a glance

| Dimension | State |
|---|---|
| Build | All 8 MVP work packages (WP-0 → WP-7) built and independently review-passed; app runs end-to-end |
| Tests | 229 web/tool + 56 backend tests green · 7/7 e2e scenarios · eval-smoke 10/10 (state @ `c64e870`) |
| Bundle / license | 115.65 KB gz initial (250 KB budget) · 94 packages, license firewall clean |
| Real accuracy | GuitarSet chord eval: **78.5%** all-comp / **69.5%** held-out players — real numbers, §16 gate (≥90%) **not** claimed |
| §16 acceptance gates | **None measured** on real home-setup captures — all deferred pending real capture data |
| Biggest lever | **Do the first real capture session** (everything deferred hangs on it) |
| Next build plan | Direct-capture-first input + tone engine (TP-0 → TP-4, planned, not started) |

## 2. Executive summary

The overnight run of 2026-07-03 (Fable 5 orchestrating ~20 Opus/Sonnet subagents, every WP independently reviewed) produced a genuinely working end-to-end MVP: camera+mic capture → real MediaPipe hand landmarks + ChArUco/manual calibration → real chord/onset/pitch DSP → confidence-weighted fusion with trust-preserving hints → local-only coach. Day 2 added the first **real-audio accuracy numbers** (GuitarSet), the target-dot overlay (the core UX moment), coaching off the owner's Claude subscription (no API key), and a +4.9-point held-out chord-accuracy win from a one-line chroma band-limit.

The honest caveat that governs everything: **no ML accuracy gate has been measured on real home-setup captures.** Overnight numbers were synthetic or fake-device and are labeled as such everywhere they appear; the GuitarSet numbers are real but are Q-04 evidence, not the §16 home-setup gate.

## 3. Work packages — status and evidence

All review-PASS. Condensed; full verification gates are in [plans/implementation-work-packages.md](plans/implementation-work-packages.md).

| WP | Commit(s) | Evidence highlights |
|---|---|---|
| WP-0 Foundation & license firewall | 32815c3 + d128324 | Firewall proven **fail-closed** both ways: real AGPL package (`essentia.js`) trips the name-denylist; real SPDX ids (AGPL/GPL/SSPL/NC/BUSL…) trip the license-expression path. Live run: 94 packages clean. Tokens, CI skeleton, COOP/COEP in place |
| WP-1 Capture shell | f9004ca + d16c280 | Torn-read-safe SAB ring buffer; fake-device e2e: 41 rVFC ticks/2s, 762 audio frames read, 0 dropped, glass-to-worker ~4–7 ms. 30fps/no-jank deferred to real hardware |
| WP-2 Audio open-chord loop | fbcb7f1 | Own spectral-flux onset (1.3 ms timing error on synthetic pluck); chroma templates 8/8 synthetic chords; YIN tuner <5 cents on pure tones; REAL `@spotify/basic-pitch` transcribing in-browser. All numbers synthetic-labeled |
| WP-3 Vision + calibration | d87ae98 | REAL MediaPipe HandLandmarker in-browser (21 landmarks, conf 0.936 on sample photo); ChArUco via OpenCV 5 (12/12 synthetic corners, reproj <0.02); manual 4-corner DLT primary; fret geometry unit-proven |
| WP-4 Fusion engine | 0aa7ec0 + a0d9a35 | Deterministic pure engine (purity test-enforced); confidence-weighted fusion; three §9.2 canonical cases proven; reviewer caught a real clock-topology bug (vision timestamps biased low → silent audio-only fusion) — fixed via wall-clock anchor bridging; dual-evidence diagnoses proven live in e2e |
| WP-5 Slow-path coach | e5d8f7f | Hardened proxy: sqlite-persisted kill-switch (survives restart), injection fencing, taxonomy-bounded output + template fallback, key hygiene test-enforced. Local-only mode DEFAULT ON with zero-network proof. 42→56 backend tests |
| WP-6 Data flywheel | 6382532 | Annotation tool complete (sync'd video/waveform/spectrogram, fingertip/taxonomy tagging, active-learning queue, consent+deletion receipts); JAMS/COCO schemas round-trip-tested; GuitarSet (CC-BY-4.0, 696 MB) fetched sha256-verified; IDMT honestly skipped (NC + form-gated) |
| WP-7 Hardening & Beta | 5a987a1 | Sentry privacy-first (DSN-gated, scrub + masked replay, no-leak ErrorBoundary — all unit-proven); latency histograms + complaint metric; eval-smoke CI gate independently proven to fail red. Tauri + cloud sync honestly not started |

Integration: `cc42d15` unified string numbering to standard (1 = high e … 6 = low E) across both perception legs.

## 4. Day-2 increments (2026-07-03 → 07-04)

| Item | Status | Commit | Notes |
|---|---|---|---|
| GuitarSet real-audio chord eval | done, review PASS | 35ae378 | First real-data number: 75.1% top-1 on 678 in-scope strummed segments (dev players 80.3%, held-out 64.6%). Top confusions C→Em, Em→E, E→D. Reviewer reproduced exactly. Report: `models/audio/guitarset-eval-report.md`; rerun: `node scripts/eval-guitarset.mjs` |
| Chroma band-limit (fMax = 800 Hz) | done — kept | f315229 | Disciplined 20-config sweep, tuned on dev players only, single held-out run: **held-out 64.6% → 69.5%, all-comp 75.1% → 78.5%**. One-line change; latency unchanged; synthetic + eval-smoke green untouched. Still short of 90% → Q-04 CRNN trigger stands |
| Overlay target dots + wrong-play flash | done, review PASS | 3729e97 | Lesson fingering projected onto live video (I/M/R/P dots, open/avoid markers), tinted by fused per-string status; confidence-gated red/green flash, nothing below the gate (ADR-007); no calibration → no dots, ever |
| Claude-subscription coach provider | done, live-proven twice | 363dac2 | `COACH_PROVIDER=claude_cli`: coaching via the owner's authenticated Claude CLI — no API key. Hardened (arg-list subprocess, env allowlist, tools disabled, timeout+tree-kill); same taxonomy validation; kill-switch binds on call volume |
| ADR-010 amended: Firebase | decided | 2a966ce | Firebase (Auth + Firestore + Cloud Storage) replaces Supabase for the future opt-in sync layer. Local-first stays default |
| docs §9.4 string-numbering fix | done | 62cda31 | Lesson example corrected to the standard convention |

## 5. Acceptance gates (§16) — measured vs deferred

**House rule: no accuracy number is claimed unless measured on real data and labeled with its fixture.**

| Gate | Target | Best real evidence so far | Status |
|---|---|---|---|
| Open-chord accuracy (home setup) | ≥90% | GuitarSet 78.5% comp / 69.5% held-out (not a home-setup measurement) | **Deferred** — next lever is the Phase-1 chord CRNN (Q-04) |
| Fingertip → fret/string | ≥85% | none (synthetic geometry proofs only) | **Deferred** — needs seated + ChArUco capture session |
| Strum-timing MAE | <100 ms | 1.3 ms on synthetic single-pluck | **Deferred** — synthetic only |
| False-critical feedback | <5% | none (policy unit-enforced, unmeasured) | **Deferred** — needs labeled real lessons |
| Teacher agreement on top feedback | >75% | none | **Deferred** — needs 2–3 teacher raters |
| Corrective hint latency | <250 ms glass-to-glass | 0.2–1.3 ms ingest→emit (NOT glass-to-glass) | **Deferred** — needs reference laptop + real camera/mic |
| Sustained 30 fps, no jank | by eye | fake-cam e2e plumbing proof only | **Deferred** — needs a human with a real webcam |

## 6. Known deviations from the plan

- Basic Pitch runs via `@spotify/basic-pitch` (TF.js), not the planned `onnxruntime-web` WebGPU path (needs a validated ONNX export first).
- Tuner is our own YIN DSP, not CREPE (needs a manual ONNX export; seam `TunerSource` is ready).
- Backend Dockerfile authored but never built (no Docker locally). Tauri desktop not started (no Rust toolchain). Firebase sync not started (no project yet).
- Sentry wired but never fired at a live DSN. CI e2e job has not been confirmed green on a GitHub runner (non-blocking until then).

## 7. Open blockers → human actions (prioritized)

Living detail in [`blockers.md`](blockers.md); this is the prioritized rollup as of 2026-07-06.

1. **Do the first real capture session** — the gate for nearly everything below. Print the ChArUco board (5×4, `DICT_4X4_50`, spec in WP-3 code), record the 8 open chords with scripted mistakes per `data/capture-protocol.md`, label in the annotation tool.
2. Fingertip ≥85% gate: measure from that session (WP-3).
3. False-critical <5% + calibration + glass-to-glass <250 ms: record/label real lessons, measure on the reference laptop (WP-4).
4. 30 fps/no-jank: run `pnpm --filter ./apps/web dev` with a real webcam, confirm by eye (WP-1).
5. Chord ≥90%: GuitarSet says templates top out ~78% — build/eval the Phase-1 CRNN (Q-04 trigger stands) plus home-mic clips (WP-2).
6. Teacher-agreement >75%: recruit 2–3 teachers, run the §16 eval (WP-5).
7. ~~No frontier API key~~ **MITIGATED 2026-07-04**: subscription mode (`claude_cli`) live-proven; an `ANTHROPIC_API_KEY` is only needed for the multi-user path.
8. Trainable labeled set: execute capture-protocol stage 1, label it (WP-6, depends on 1).
9. Confirm GitHub Actions green on a real runner, then promote the e2e job to a required check (WP-7).
10. Basic Pitch ONNX export → `onnxruntime-web` WebGPU EP; CREPE ONNX export → swap behind `TunerSource` (WP-2, deferred).
11. Tauri: install Rust + `tauri-cli`, scaffold `apps/desktop`, re-run §16 on desktop (WP-7).
12. Firebase: create the project, build opt-in sync, prove Local-only mode never leaks (WP-7, ADR-010 as amended).
13. Sentry: set a real `VITE_SENTRY_DSN`, confirm masked on-error replay contains no un-masked biometric media (WP-7).
14. Docker Desktop: validate the backend container build (WP-5).
15. IDMT-SMT-GUITAR: only via the Fraunhofer form, offline-eval only, never shipped (WP-6).
16. ~~docs §9.4 string numbering~~ **RESOLVED 2026-07-03** (62cda31). ~~corepack EPERM~~ cosmetic, no action.

## 8. How to run and verify

```bash
pnpm install
pnpm --filter ./apps/web dev    # http://localhost:5173 — allow camera+mic; wizard → Start capture

# full verification suite (details + interpretation: docs/testing.md):
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm bundle-size && pnpm license-check
pnpm eval-smoke
pnpm --filter ./apps/web e2e

# backend coach (optional):
cd services/backend && .venv\Scripts\Activate.ps1
$env:COACH_PROVIDER = "fake"    # or "claude_cli" for live subscription coaching
uvicorn app.main:app --port 8000
python -m pytest -q

# annotation tool:
pnpm --filter ./apps/annotation-tool dev
```

(No root-level `pnpm dev` — `dev` lives in each app's own `package.json`, hence `--filter`.)

## 9. What's next

1. **The single most important action:** the first real capture session (blocker #1). It is also the decision point for the two biggest architecture reopeners: template-matcher vs CRNN for chords, and geometric mapping vs learned contact classifier for fingertips.
2. **Queued build plan:** direct-capture-first input policy + native Web Audio tone engine — [plans/direct-capture-and-tone-work-packages.md](plans/direct-capture-and-tone-work-packages.md) (TP-0 → TP-4, task-level, ready to execute).

## 10. Run-integrity footnote (2026-07-03 run)

Two session-limit interruptions were resumed cleanly with all gates re-verified. Three subagent spawns returned empty (harness glitch) and were re-dispatched successfully. The planning docs were never modified by the build itself; the one docs inconsistency found that night (§9.4 string numbering) was fixed in code the same night and in the docs on Day 2.
