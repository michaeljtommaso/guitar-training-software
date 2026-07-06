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

Research agents have been dispatched for:

1. Existing commercial software and product gaps.
2. Open-source repos, papers, and ML/audio/CV building blocks.
3. Full implementation architecture and MVP roadmap.

Their reports should be saved under [`research/agent-reports/`](research/agent-reports/) as they come in.

## Repository map

| Path | Purpose |
|---|---|
| `docs/product-brief.md` | What we are building and why |
| `docs/research-questions.md` | Deep-research questions for agents |
| `docs/architecture-hypothesis.md` | Initial technical architecture hypothesis |
| `docs/mvp-roadmap.md` | Phased build plan |
| `research/agent-briefs/` | Exact research briefs sent to agents |
| `research/agent-reports/` | Saved agent research outputs |
| `research/source-index.md` | Source and link index to maintain during research |

## Planning & architecture

The Opus-stack planning deliverable defines the full stack, decisions, build order, and open risks — architecture only, no application code yet.

| Doc | Purpose |
|---|---|
| [`docs/opus-stack-implementation-plan.md`](docs/opus-stack-implementation-plan.md) | Front-to-back stack & architecture: research sanity-check, per-layer recommendations with alternatives, and how the system works end to end |
| [`docs/technology-decision-records.md`](docs/technology-decision-records.md) | ADR-style records of the load-bearing decisions (platform, frontend, overlay, capture, audio, vision, fusion, backend, data, model/proxy, license firewall, deploy/eval) with alternatives and reopen triggers |
| [`docs/implementation-work-packages.md`](docs/implementation-work-packages.md) | Ordered build work packages (WP-0 → WP-7) with scope, deliverables, verification gates, dependencies, and explicit non-goals |
| [`docs/open-questions-and-research-gaps.md`](docs/open-questions-and-research-gaps.md) | Unresolved risks/questions with why each matters, validation method, owner lane, and decision trigger |
| [`docs/amp-modeling-and-tone-engine-research.md`](docs/amp-modeling-and-tone-engine-research.md) | Direct research on “guitar in → amp sound out”: hardware path, amp/cab DSP, open-source stacks, and how an optional tone engine coheres with the tutor architecture |

## Working name ideas

- Guitar Training Software
- FretCoach
- VisionFret Tutor
- StringSense
- Mimir Guitar Coach

