# Overnight Build Progress

Run started 2026-07-03 with Fable 5 orchestrating Opus/Sonnet subagents.

| WP | Name | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| WP-0 | Foundation & license firewall | done (review PASS) | 32815c3 + d128324 | License firewall proven fail-closed on real AGPL pkgs (name-denylist + license-expression paths). All gates re-run by independent reviewer. |
| WP-1 | Capture shell | done (review PASS) | f9004ca + d16c280 | Fake-device e2e proves full plumbing: 41 rVFC ticks/2s, framesRead 765, dropped 0, glass-to-worker ~4-5 ms, backend=wasm. 30fps/no-jank gate deferred to real hardware. |
| WP-2 | Audio open-chord loop | done (review PASS) | fbcb7f1 (merge b694925) | Own spectral-flux onset DSP, chroma templates 8/8 on synthetic, YIN tuner (CREPE ONNX deferred), REAL @spotify/basic-pitch running (ORT WebGPU path deferred). All numbers synthetic-labeled; ≥90% chord + <100ms MAE gates deferred — needs real capture data. |
| WP-3 | Vision + marker calibration | done (review PASS) | d87ae98 (merge 34c292e) | REAL MediaPipe HandLandmarker in-browser (21 landmarks, conf .936 on sample photo); ChArUco genuinely wired via OpenCV 5 objdetect + manual-tap DLT primary; equal-tempered fret geometry unit-proven. ≥85% fingertip gate deferred — needs real capture data. |
| WP-4 | Fusion engine | done (review FAIL→fixed→PASS) | 0aa7ec0 + fix a0d9a35 | Deterministic pure engine (purity test-enforced), confidence-weighted fusion (0.6·audio+0.4·vision, single-leg capped 0.75), three §9.2 canonical cases proven at engine level, feedback policy rate-limited/false-positive-averse, lessons-as-data flip proven with zero engine change, Dexie session log Zod-gated + ring-capped. Reviewer caught a real clock-topology blocker (vision timestamps biased seconds low → fusion silently audio-only); fixed via Date.now() wall-clock bridging with together-sampled anchors; cross-leg fusion now proven live in e2e (10 dual-evidence diagnoses). 118 tests, 4/4 e2e. <5% false-critical + calibration gates deferred — needs labeled lesson set. Hint latency measured as event-ingest→hint-emit ~0.2-1.3ms (NOT glass-to-glass; that needs real hardware). |
| WP-5 | Slow-path coach | not started | | |
| WP-6 | Data flywheel | not started | | |
| WP-7 | Hardening & Beta | not started | | |

Integration commit cc42d15: string numbering unified to standard (1 = high e … 6 = low E) across both legs; reviewer PASS with nits only; 82 tests + 3/3 e2e green on merged main.

**Standing note:** All ML accuracy gates (≥90% chord, ≥85% fingertip→fret/string, <5% false-critical, >75% teacher agreement) are **deferred — needs real capture data**. No accuracy number may be claimed from tonight's run.
