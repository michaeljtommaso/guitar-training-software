# Guitar Training Software

A research-and-build repository for a personal real-time guitar tutor: a system that watches and listens while you play, detects chords/notes/fingering/string mistakes, and gives live visual feedback for learning guitar.

## Product vision

Build a **multimodal guitar coach** that combines:

- **Webcam vision**: fretboard, fingers, frets, strings, hand posture, chord shape correctness.
- **Microphone/audio analysis**: pitch, notes, chords, timing, rhythm, wrong/muted strings.
- **Real-time feedback UI**: chord/key display, string/fret overlays, highlighted mistakes, practice drills.
- **Lesson engine**: guided chord learning, adaptive exercises, progress tracking.
- **Model-assisted coaching**: use a powerful multimodal model where practical, with low-latency local signal-processing fallback.

## Current status

The MVP (WP-0 → WP-7) is built, tested, and review-passed — see [`docs/status.md`](docs/status.md) for the structured status: work-package evidence, measured vs deferred accuracy gates, prioritized blockers, and next actions. The live blocker ledger is [`BLOCKERS.md`](BLOCKERS.md); the original research inputs live under [`docs/research/`](docs/research/).

## Repository map

Docs are organized by lane: `docs/product/` (what & why), `docs/architecture/` (how it's built), `docs/plans/` (executable work packages), `docs/research/` (research inputs & open questions), plus `docs/testing.md` (how to verify it all).

| Path | Purpose |
|---|---|
| `docs/product/product-brief.md` | What we are building and why |
| `docs/product/mvp-roadmap.md` | Phased build plan |
| `docs/architecture/architecture-hypothesis.md` | Initial technical architecture hypothesis |
| `docs/research/research-questions.md` | Deep-research questions for agents |
| `docs/research/agent-briefs/` | Exact research briefs sent to agents |
| `docs/research/agent-reports/` | Saved agent research outputs |
| `docs/research/source-index.md` | Source and link index maintained during research |
| `docs/status.md` | Structured project status: WP evidence, gates measured vs deferred, blockers, next actions |
| `docs/testing.md` | How to test the software — every suite, gate, and manual check |

## Planning & architecture

The Opus-stack planning deliverable defines the full stack, decisions, build order, and open risks — architecture only, no application code yet.

| Doc | Purpose |
|---|---|
| [`docs/architecture/opus-stack-implementation-plan.md`](docs/architecture/opus-stack-implementation-plan.md) | Front-to-back stack & architecture: research sanity-check, per-layer recommendations with alternatives, and how the system works end to end |
| [`docs/architecture/technology-decision-records.md`](docs/architecture/technology-decision-records.md) | ADR-style records of the load-bearing decisions (platform, frontend, overlay, capture, audio, vision, fusion, backend, data, model/proxy, license firewall, deploy/eval) with alternatives and reopen triggers |
| [`docs/plans/implementation-work-packages.md`](docs/plans/implementation-work-packages.md) | Ordered build work packages (WP-0 → WP-7) with scope, deliverables, verification gates, dependencies, and explicit non-goals |
| [`docs/research/open-questions-and-research-gaps.md`](docs/research/open-questions-and-research-gaps.md) | Unresolved risks/questions with why each matters, validation method, owner lane, and decision trigger |
| [`docs/product/product-vision-direct-capture-tone.md`](docs/product/product-vision-direct-capture-tone.md) | Cleaned-up product vision: default to direct DI/interface capture for accuracy, fall back to mic capture, and ship digital amp/pedal tone as a real feature |
| [`docs/research/amp-modeling-and-tone-engine-research.md`](docs/research/amp-modeling-and-tone-engine-research.md) | Direct research on “guitar in → amp sound out”: hardware path, amp/cab DSP, open-source stacks, and how an optional tone engine coheres with the tutor architecture |
| [`docs/plans/direct-capture-and-tone-work-packages.md`](docs/plans/direct-capture-and-tone-work-packages.md) | Executable work packages (TP-0 → TP-4) turning the direct-capture + tone vision into bite-sized tasks: input classifier + setup wizard, native Web Audio tone chain, lesson tone presets, session metadata — with tests, code, and verification gates |
| [`docs/testing.md`](docs/testing.md) | Testing guide: how to run and interpret every suite/gate for the existing software, plus how to test the new direct-capture + tone additions |

## Working name ideas

- Guitar Training Software
- FretCoach
- VisionFret Tutor
- StringSense
- Mimir Guitar Coach

