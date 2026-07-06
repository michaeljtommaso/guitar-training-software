# MVP Roadmap

## Phase 0 — Research and source inventory

- Save commercial product report.
- Save open-source/papers report.
- Save technical architecture report.
- Decide whether to fork/build on an existing repo or start greenfield.

## Phase 1 — Direct-capture-first audio trainer

- Capture dry DI/interface audio by default when available; fall back to mic audio when no suitable interface is connected.
- Add an input setup wizard: device selection, level meter, clipping/noise checks, and DI-vs-mic heuristic classification.
- Detect tuning, pitch classes, chord candidates, wrong/missing strings.
- Show target chord and detected chord in real time.
- Start with open-position chords: C, G, D, A, E, Am, Em, Dm.
- Keep correctness analysis on the **dry/clean path** even if the user monitors through an amp tone.

## Optional Tone Lane — Practice amp / monitoring engine

This lane is additive to the tutor, not a replacement for the dry correctness path. See [`amp-modeling-and-tone-engine-research.md`](../research/amp-modeling-and-tone-engine-research.md).

- Treat direct guitar input through a Hi-Z audio interface as the preferred/default path where available.
- Split input into:
  - **dry analysis path** → tuner / notes / chords / fusion
  - **wet monitoring path** → gate / amp model / cab IR / output
- Start with simple antialiased distortion + tone stack + cabinet IR.
- Treat the tone/pedal engine as a product feature: practice tones, lesson presets, and a basic pedal-style signal chain.
- Add NAM / neural amp model loading only after the analysis/fusion MVP is stable.
- Preserve the browser-first tutor plan; move low-latency amp monitoring to Tauri/native only if browser latency is not playable.

## Phase 2 — Webcam-assisted fretboard/finger overlay

- Calibrate guitar neck orientation.
- Detect strings/frets/fretboard region.
- Track fretting hand landmarks.
- Estimate whether fingers are near target frets/strings.
- Overlay target and actual finger positions.

## Phase 3 — Fusion coaching

- Combine audio correctness with visual fingering estimate.
- Distinguish: correct shape but poor pressure/muting, wrong fret, wrong string, wrong picking timing.
- Give actionable corrections.

## Phase 4 — Lessons, progress, and model review

- Add structured lessons and drills.
- Record short practice clips.
- Use frontier multimodal model to summarize recurring mistakes and propose practice plans.

## Phase 5 — Song/tab following

- Load tabs/music XML/MIDI.
- Align live audio to expected notes/chords.
- Provide Rocksmith-like guided practice.
