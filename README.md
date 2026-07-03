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

## Working name ideas

- Guitar Training Software
- FretCoach
- VisionFret Tutor
- StringSense
- Mimir Guitar Coach

