# Research Reports

This directory stores the complete outputs from the parallel research agents dispatched for the real-time multimodal guitar tutor project.

## Reports

| File | Topic |
|---|---|
| `agent-reports/01-commercial-products.md` | Commercial guitar-learning software landscape: Yousician, Rocksmith+, Simply Guitar, Fender Play, Gibson App, Uberchord, Chordify, Fret Zealot, LiberLive, market gap analysis |
| `agent-reports/02-open-source-and-papers.md` | Open-source projects, GitHub repos, papers, datasets, and libraries for audio transcription, guitar tab inference, and computer vision |
| `agent-reports/03-architecture-and-build-plan.md` | Full technical architecture, UX, model strategy, latency budgets, datasets, evaluation plan, MVP roadmap |
| `agent-reports/delegation-batch-raw.md` | Raw consolidated async delegation output as delivered by Hermes |

## Headline conclusion

No mature open-source project currently provides the full target experience: **real-time guitar tutoring using both audio and webcam vision to diagnose chords, notes, string/fret/finger mistakes, and posture**.

The opportunity is real because commercial leaders are mostly **audio-first** and open-source building blocks are **partial but composable**.

## Recommended product direction

Build a hybrid system:

- **Local/on-device real-time perception:** MediaPipe/vision + Basic Pitch/audio + deterministic lesson/fusion engine.
- **Frontier multimodal model:** explanation, ambiguity resolution, adaptive practice planning, post-session review.
- **MVP wedge:** open-chord coach with mic + webcam, constrained camera setup, confidence-aware overlays.
