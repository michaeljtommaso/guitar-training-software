# MVP Roadmap

## Phase 0 — Research and source inventory

- Save commercial product report.
- Save open-source/papers report.
- Save technical architecture report.
- Decide whether to fork/build on an existing repo or start greenfield.

## Phase 1 — Audio-only chord trainer

- Capture mic audio.
- Detect tuning, pitch classes, chord candidates, wrong/missing strings.
- Show target chord and detected chord in real time.
- Start with open-position chords: C, G, D, A, E, Am, Em, Dm.

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
