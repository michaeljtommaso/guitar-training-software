# Reference hardware (provisional)

> **Status (WP-7):** PROVISIONAL reference target — this is the overnight build
> machine, recorded so the §14 latency budgets and §16 acceptance metrics have a
> concrete baseline. It is **not yet a ratified reference laptop**: the §16 gates
> below are **unmeasured on real hardware/input** tonight (see docs/blockers.md). The
> numbers in "Measured tonight" are **synthetic / fake-device** and make **no**
> real-guitar accuracy or glass-to-glass latency claim.

## Probed machine (2026-07-03, via PowerShell CIM)

| Component | Value |
|---|---|
| CPU | Intel(R) Core(TM) Ultra 5 236V (Lunar Lake), 8 cores / 8 threads, 2.1 GHz base |
| RAM | 16 GB (15.7 GB usable) |
| GPU | Intel(R) Arc(TM) 130V GPU (8 GB shared), driver 32.0.101.6737 |
| OS | Windows 11 Pro 10.0.26200 |
| Browser (perf lane) | Chromium 149.0.7827.55 (Playwright 1.61.1, revision 1228) — the version the e2e/eval lane drives |

This is a thin-and-light with an integrated Arc iGPU and NPU. It represents the
**mid-range 2025/2026 laptop** the MVP targets — WebGPU-capable, no discrete GPU
required (§14: nothing discrete is needed to *run*; the GPU lane is for training).

## §14 latency budgets (the CI-gated targets)

| Loop | Budget | Notes |
|---|---|---|
| Vision | ~35–70 ms | capture + landmarks + geometry + fingertip + overlay |
| Audio | ~40–90 ms | buffer + DSP + onset/chord + smoothing |
| Feedback (fusion+rules) | ~60–120 ms | once context exists |
| **Deterministic corrective hint** | **< 250 ms** | §16 system gate, on the reference laptop |
| Frontier (explanation only) | ~300 ms–2 s+ | never in the correctness loop |

## §16 acceptance metrics (status)

| Layer | Gate | Status on this machine |
|---|---|---|
| Vision | fingertip→fret/string ≥ 85% | **UNMEASURED** — no real webcam+marker captures (BLOCKERS) |
| Audio | open-chord ≥ 90% clean; strum MAE < 100 ms | **UNMEASURED** — no real guitar recordings (BLOCKERS) |
| Fusion | false critical feedback < 5% | **UNMEASURED** — no labeled internal lesson set (BLOCKERS) |
| Coaching | teacher agreement > 75% | **UNMEASURED** — no teacher raters (BLOCKERS) |
| System | corrective hint < 250 ms glass-to-glass | **UNMEASURED** — headless can't see glass (BLOCKERS) |

## Measured tonight (SYNTHETIC / fake-device only — not a §16 claim)

From `pnpm eval-smoke` (synthetic fixtures through the real code paths, jsdom/Node
on this machine) and the existing suites:

| Signal | Value | Label |
|---|---|---|
| Chord template matcher | 10 / 10 exact (8 chords + silence + noise) | synthetic fixtures |
| Fingertip → string/fret | 3 / 3 exact assignments | synthetic, identity homography |
| Onset timing error | ~1.3 ms (tol 35 ms) | synthetic pluck |
| Analyzer latency | ~86 ms on a 1 s buffer | synthetic, **headless jsdom** — NOT the §16 reference-laptop hot-loop number |
| Fusion ingest→hint (main thread) | ~0.2–1.3 ms median | synthetic streams; **not** glass-to-glass |
| Audio glass-to-worker | fake-device only (~20 fps synthetic cam) | Chromium `--use-fake-device-for-media-stream` |

The debug panels surface the live p50/p95 for the fusion-hint and glass-to-worker
loops (`LatencyHistogram`, `src/observability/latencyHistogram.ts`) so these can be
read off the **real reference laptop** once one is captured.

## To ratify this as THE reference laptop

1. Run a seated + ChArUco capture session; measure vision fingertip→fret/string ≥ 85%.
2. Record real guitar audio (or GuitarSet clips through the mic path); measure chord ≥ 90%, strum MAE < 100 ms.
3. Measure glass-to-glass corrective-hint latency with a real camera+mic (< 250 ms).
4. Label + measure a fusion lesson set (false critical < 5%).
5. Re-run `pnpm eval-smoke` and confirm the synthetic baselines are unchanged.
