# Overnight Build Progress

Run started 2026-07-03 with Fable 5 orchestrating Opus/Sonnet subagents.

| WP | Name | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| WP-0 | Foundation & license firewall | done (review PASS) | 32815c3 + d128324 | License firewall proven fail-closed on real AGPL pkgs (name-denylist + license-expression paths). All gates re-run by independent reviewer. |
| WP-1 | Capture shell | done (review PASS) | f9004ca + d16c280 | Fake-device e2e proves full plumbing: 41 rVFC ticks/2s, framesRead 765, dropped 0, glass-to-worker ~4-5 ms, backend=wasm. 30fps/no-jank gate deferred to real hardware. |
| WP-2 | Audio open-chord loop | not started | | |
| WP-3 | Vision + marker calibration | not started | | |
| WP-4 | Fusion engine | not started | | |
| WP-5 | Slow-path coach | not started | | |
| WP-6 | Data flywheel | not started | | |
| WP-7 | Hardening & Beta | not started | | |

**Standing note:** All ML accuracy gates (≥90% chord, ≥85% fingertip→fret/string, <5% false-critical, >75% teacher agreement) are **deferred — needs real capture data**. No accuracy number may be claimed from tonight's run.
