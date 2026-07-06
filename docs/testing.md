# Testing Guide

> How to test everything in this repo: the existing tutor (WP-0…WP-7, built), and the new direct-capture + tone additions ([plans/direct-capture-and-tone-work-packages.md](plans/direct-capture-and-tone-work-packages.md)) as they land.
> All commands run from the repo root unless noted. Date: 2026-07-06.

## 0. Prerequisites

| What | Version | Setup |
|---|---|---|
| Node + pnpm | Node 24, pnpm 11 | `pnpm install --frozen-lockfile` |
| Python (backend only) | 3.11 | `cd services/backend && pip install -r requirements.txt` |
| Playwright Chromium (e2e only) | — | `pnpm --filter web exec playwright install chromium` (once) |
| GuitarSet data (real-audio eval only) | ~696 MB | `node scripts/fetch-eval-data.mjs` (downloads into gitignored `data/eval/`, sha256-verified) |

## 1. The one-command answer

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bundle-size && pnpm eval-smoke && pnpm license-check
```

That is what CI runs (`.github/workflows/ci.yml`), minus e2e (non-blocking in CI) and the backend (Python, separate). If all of it is green plus `python -m pytest -q` in `services/backend` and `pnpm --filter web e2e`, the repo is as verified as it gets without real hardware.

## 2. Testing the existing software

### 2.1 Web + annotation-tool unit tests (Vitest)

```bash
pnpm test                        # recursive: apps/web + apps/annotation-tool (~229 tests)
pnpm --filter web test           # web app only
pnpm --filter web test chords    # one file/pattern (vitest filter)
```

What they cover, by area:

| Area | Files (under `apps/web/src/`) | What a failure means |
|---|---|---|
| Own DSP | `perception/audio/dsp/*.test.ts` (fft, onset, chords, tuner) | The math the audio loop runs on is wrong — fix before anything else |
| Real-sample DSP | `perception/audio/realSample.node.test.ts` | The chroma/chord path regressed on real recorded audio |
| Ring buffer | `perception/audio/ringBuffer.test.ts` | SAB frame transport broken — capture will silently drop/corrupt |
| Capture guardrail | `capture/buildConstraints.test.ts` | Someone re-enabled echoCancellation/noiseSuppression/AGC — **deliberate tripwire**, do not "fix" the test (ADR-004) |
| Fusion engine | `fusion/engine.test.ts`, `diagnosis.test.ts` | Correctness core: canonical §9.2 cases, purity enforcement |
| Feedback policy | `fusion/feedbackPolicy.test.ts` | Rate-limiting / confidence gating of hints broken — false-feedback risk |
| Lessons-as-data | `fusion/lessons.test.ts` | Lesson schema/loading |
| Session log | `fusion/sessionLog.test.ts` | Zod write gate or ring caps broken — bad data can reach IndexedDB |
| Annotation tool | `apps/annotation-tool/src/**` (60 tests) | Labeling pipeline (WP-6) |

### 2.2 Backend tests (pytest)

```bash
cd services/backend
python -m pytest -q              # ~56 tests, no API key needed (fake provider)
```

Covers: model-proxy guards (injection fencing, taxonomy-bounded output), cost-cap kill-switch (sqlite-persisted across restarts), API-key hygiene (test-enforced: keys never reach the CLI provider env), rate limits, the four coaching modes + template fallback, WebSocket coaching stream, clips/content endpoints. The `claude_cli` provider tests run against a stub; a **live** subscription smoke needs the authenticated Claude CLI on the machine and is not part of the suite.

### 2.3 End-to-end (Playwright, real Chromium, fake camera/mic)

```bash
pnpm --filter web e2e            # builds, serves via vite preview, runs 7 scenarios
pnpm --filter web e2e audio-loop # one spec
```

Specs in `apps/web/e2e/` and what each proves:

| Spec | Proves |
|---|---|
| `capture-smoke.spec.ts` | Full WP-1 plumbing: rVFC ticks, audio frames drained, glass-to-worker latency logged |
| `audio-loop.spec.ts` | Fake-device tone → worklet → SAB → worker → onset/tuner events reach the main thread |
| `hand-landmark.spec.ts` | Real MediaPipe HandLandmarker runs in-browser (21 landmarks on a still image) |
| `fusion-lesson.spec.ts` | Lesson → dual-evidence (audio+vision) diagnoses → hints, end to end |
| `coach-local-only.spec.ts` | Local-only mode delivers corrections + template coaching with zero network |

Debug hooks available in the browser console while capture runs: `window.__captureDebug.snapshot()` (perception/fusion state), `window.__visionDebug` (landmark status). The new tone work adds `window.__toneDebug` (TP-1).

Note: the CI e2e job is `continue-on-error` (not yet proven stable on GitHub runners) — treat a local e2e run as the real bar.

### 2.4 Regression gates (fast, synthetic, CI-blocking)

```bash
pnpm eval-smoke      # committed synthetic fixtures through the REAL code paths; fails on accuracy/latency regression
pnpm bundle-size     # initial JS budget: 250 KB gz (currently ~116 KB)
pnpm license-check   # license firewall: fails the build on AGPL/GPL/NC reaching the client bundle
node --test scripts/license-rules.test.mjs   # the firewall's own tests (proven fail-closed)
```

### 2.5 Real-audio evaluation (GuitarSet — the honest accuracy number)

```bash
node scripts/fetch-eval-data.mjs   # once; ~696 MB, CC-BY-4.0
node scripts/eval-guitarset.mjs    # runs the production chord matcher on real recordings
```

Current state (see `models/audio/guitarset-eval-report.md` for the full sweep): **78.5%** top-1 on in-scope strummed segments, **69.5%** on held-out players. This is Q-04 evidence, *not* the §16 home-setup gate. House rule: **never claim a synthetic number as a real-accuracy number** — label which fixture produced it.

### 2.6 What cannot be tested without real hardware (standing deferrals)

From [status.md §5](status.md): the §16 ML gates — ≥90% chord on home setups, ≥85% fingertip→fret/string, <5% false-critical feedback, >75% teacher agreement — plus the 30 fps/no-jank gate all need **real capture data / real users** and remain unclaimed. Manual dev loop for hardware checks:

```bash
pnpm --filter web dev   # copies vision assets, serves the app
```

Start capture, use the on-page Debug/Audio panels (chord posterior, tuner, onsets, latency) with a real guitar.

## 3. Testing the new additions (direct capture + tone engine)

Each TP task in [plans/direct-capture-and-tone-work-packages.md](plans/direct-capture-and-tone-work-packages.md) is TDD — the test lands *before* the code. This section is the tester's view of the same work: what to run and what to look at after each package merges.

### 3.1 TP-0 — Direct-capture wizard (automated)

```bash
pnpm --filter web test devices       # label classifier + interface picker
pnpm --filter web test inputHealth   # RMS/peak/clip-latch/noise-floor meter math
pnpm --filter web test sessionLog    # session records carry optional input metadata
pnpm --filter web e2e                # existing specs must stay green (fake device classifies "unknown" → no auto-restart)
```

### 3.2 TP-0 — Direct-capture wizard (manual, needs an interface + guitar)

1. Plug in a USB interface (e.g. Scarlett), start capture → the mic picker should auto-select it and the chip should read **direct input**. Unplug it, restart capture → falls back to mic with the **lower accuracy** notice.
2. Play a string: the level meter moves; crank interface gain until it clips → red **clip** light + "lower your interface gain" message.
3. Strum each open string slowly → all six chips light (6/6).
4. Reload the page → the device choice persists (localStorage `gt-capture-devices`).
5. Run a lesson, then in DevTools → Application → IndexedDB → `guitar-tutor` → `sessions`: the newest record has `input: { kind: "interface", label, sampleRate, … }`.

### 3.3 TP-1 — Tone engine (automated)

```bash
pnpm --filter web test shaper     # drive curve: odd symmetry, bounded, adds 3rd harmonic (verified via existing magnitudeSpectrum)
pnpm --filter web test cabIR      # default IR: deterministic, unit energy, decays, HF rolloff
pnpm --filter web test gateCore   # gate opens on signal, closes below threshold, smooth release
pnpm --filter web e2e tone-monitor  # THE key spec: monitor off → silent; amp → sound; analysis identical either way (dry path = truth source, ADR-013)
pnpm bundle-size                  # tone chain is native Web Audio — budget must not move meaningfully
pnpm license-check                # zero new deps expected
```

`tone-monitor.spec.ts` is the architectural tripwire: if it fails after a tone change, the wet chain has leaked into the analysis path — that is never acceptable to "fix" by loosening the assertion.

### 3.4 TP-1 — Tone engine (manual listening test — this is Tone-0)

With guitar + interface + **headphones**:

1. Monitor **off** (default): silence. **dry**: clean DI passthrough. **amp**: processed tone.
2. Sweep drive 0→1: clean → crunch → saturated, no harsh aliasing fizz on high notes (native 4× oversampling).
3. Bass/mid/treble/presence knobs audibly shape the tone; gate threshold silences hum between phrases but never chops sustained notes.
4. Load a downloaded `.wav` cab IR → character changes vs the synthetic default.
5. Check the latency readout (output path, ms). If a strummed note feels late, note the number — persistent >25–30 ms readings with playability complaints are the TP-4 native-lane trigger.
6. Select the mic (not the interface) with monitor on → the feedback warning appears.
7. While monitoring in amp mode, watch the chord/tuner debug panel: readings must be identical to monitor-off (dry analysis unaffected).

### 3.5 TP-2 — Presets & metadata

```bash
pnpm --filter web test toneStore   # applyPreset sets params; manual tweak clears preset name
pnpm --filter web test lessons     # optional tone_preset field parses; absent field unchanged
pnpm --filter web test sessionLog  # tone { preset, monitor } round-trips
```

Manual: start the C-major lesson → tone flips to "Clean Chord Practice"; finish a session → the session record contains `tone: { preset, monitor }`.

## 4. Adding new tests — house rules

- **TDD**: failing test first, minimal code, green, commit (see the task steps in the plans).
- **Reuse the DSP scaffolding**: spectral asserts via `dsp/fft.ts` (`rms`, `magnitudeSpectrum`), signals via `dsp/synth.ts` (`sineWave`, `harmonicNote`, `chordSignal`, `OPEN_CHORD_FREQS`). Never hand-roll FFTs or sine loops in tests. `dsp/synth.ts` is test-only — it must never be imported by shipped code.
- **Pure core, thin shell**: realtime code (worklets) gets its math extracted into a pure Node-testable module (`gateCore.ts` follows `onset.ts`/`tuner.ts` precedent); the worklet itself is verified through e2e.
- **Zod at write boundaries**: anything persisted gets a schema test proving both the new shape and that legacy records still validate (`.optional()` / `.default()`).
- **Label your fixtures**: synthetic results are always reported as synthetic. Real-accuracy claims come only from `eval-guitarset` or future real-capture sets.
- **Guardrail tests are intentional**: `buildConstraints.test.ts` (voice DSP off) and `tone-monitor.spec.ts` (dry-path integrity) fail *on purpose* when someone violates an ADR. Fix the code, not the test.
