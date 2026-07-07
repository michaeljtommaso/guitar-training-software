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

Everything below is built, tested, and hardware-verified on a real webcam + guitar:

- **v2 UI** (Practice Prototype v2 design): a 3-step setup wizard → a single practice console — top bar (lesson picker, Practice | Explore toggle, tone preset, input badge, theme), camera pane with live overlay dots, a **fretboard zoom strip** (live cropped video of your fretboard when calibrated, schematic board otherwise), hint bar, coach column, telemetry footer, and a console drawer (press `` ` `` or the `console` button) housing the audio/tone/system debug panels. Dark + light themes.
- **Perception**: real MediaPipe hand tracking (fingers verified "tracked perfectly" on real hardware), ChArUco/manual fretboard calibration, chord/onset/tuner DSP with silence + noise gates, Basic Pitch polyphonic notes, deterministic fusion engine with confidence-gated hints.
- **Explore mode**: pick any chord (~3,200 voicings, easiest first) or scale and see it on the strip and projected onto your real fretboard; it listens — chord-level feedback on a mic, per-string feedback on a direct input.
- **Tone**: native Web Audio practice amp (gate/drive/EQ/cab/limiter), bundled CC0 cab IRs, lesson tone presets incl. a "Mic Input" profile.

See [`docs/status.md`](docs/status.md) for structured status and [`docs/blockers.md`](docs/blockers.md) for the live ledger; the phase-0 hardware findings live in [`docs/debug/phase0-findings.md`](docs/debug/phase0-findings.md).

## Quick start (fresh machine)

Prereqs: [Node 20+](https://nodejs.org) and pnpm (`corepack enable` ships it with Node), Chrome or Edge, a webcam, and ideally a USB audio interface with your guitar in its **Hi-Z / instrument input** (a bare mic works — accuracy and tone are just lower).

```bash
git clone https://github.com/michaeljtommaso/guitar-training-software.git
cd guitar-training-software
pnpm install --frozen-lockfile
pnpm --filter web dev        # open the printed URL in Chrome/Edge
```

1. Allow **camera + microphone** when the browser asks.
2. The one-time **setup wizard** walks you through: pick your camera + audio input (an interface shows a `direct input` badge — pick it), **Start capture**, strum each open string to 6/6, optionally measure round-trip latency, then **Start practicing**.
3. On the practice screen: pick a lesson from the top-left dropdown (it starts immediately), or flip to **Explore** to browse chords/scales. Click **calibrate** on the camera pane and tap the four fretboard corners to get overlay dots on your real neck.
4. For amp sound while you practice, open the console drawer (`` ` ``) → Tone → Monitor **amp** (use headphones on a mic input — the app warns about feedback).

Verify a build with `pnpm typecheck && pnpm test`; the full gate list is in [`docs/testing.md`](docs/testing.md).

## Field testing — how to report anything wrong

The coach column (right side) has a **log issue** tab. When anything looks or sounds wrong:

1. Switch the coach column to **log issue**, describe what you did and what you expected, hit **Log it**. The app snapshots the full live state with your note — input device and kind, calibration state, current chord/tuner readings, lesson or explore target, tone settings, and the performance telemetry — locally, no network.
2. Log as many entries as you like across the session (they persist across reloads).
3. When you're done, hit **download log** — it saves a single `guitar-debug-<date>.md`. Send us that file; it has everything we need to diagnose remotely.

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

