# Research Synthesis — Real-Time Multimodal Guitar Tutor

## Bottom line

This project is feasible as a staged build, but the full vision is not a solved commodity feature. The market has strong real-time **audio** feedback products, but not a dominant consumer product that reliably uses webcam vision to identify exact **finger/string/fret** mistakes and combine that with audio.

## Does this already exist?

### Commercial

Partially, but not fully.

- **Yousician, Simply Guitar, Rocksmith+, Gibson App, Fender Play Feedback Mode, Uberchord** provide real-time or near-real-time audio feedback.
- **Fret Zealot** provides real-instrument visual guidance through LED hardware.
- **Chordify** is strong for song chord extraction/display, but is not a live corrective tutor.
- No mainstream product was found that clearly delivers robust commodity-webcam fingering/posture/wrong-string correction.

### Open source

No mature end-to-end app was found.

Closest pieces:

- **Guitariz** — strong OSS product shell and audio-focused guitar learning app.
- **Computer-Vision-Guitar-Tutor / Chordially** — vision-based fretboard/hand prototype using MediaPipe + ArUco markers.
- **Learning-Guitar-with-Deep-Learning** — small audio+vision research prototype.
- **TappyTabs / TapToTab** — video+audio tab generation prototype/research.
- **tuitar** — real-time note/fretboard trainer without computer vision.

## Most promising building blocks

| Layer | Recommended starting points |
|---|---|
| Product shell | Guitariz-style web app architecture |
| Audio note transcription | Spotify Basic Pitch / Basic Pitch TS |
| Guitar-specific tab inference | GuitarSet, amt-tools, FretNet, guitar-transcription-with-inhibition |
| Hand tracking | MediaPipe Hands |
| Fretboard mapping | Manual calibration first; ArUco prototype; later markerless neck/fret/string detector |
| Audio rhythm/onset | Madmom / custom WebAudio onset detector |
| Curriculum/chords | UCI chord fingering data + hand-authored beginner lessons |
| Tutor reasoning | Frontier multimodal model for explanations and session summaries, not the hard real-time loop |

## Recommended MVP

Build an **open-chord coach** first:

1. Browser app captures webcam and microphone.
2. User calibrates fretboard manually or with simple markers.
3. MediaPipe detects hand landmarks.
4. Basic Pitch/audio model detects sounded notes/chords.
5. Fusion engine compares expected chord template against visual + audio state.
6. UI overlays target finger positions and highlights mistakes.
7. Frontier model reviews structured events/clips for natural-language coaching.

## Key technical risk

The hardest problem is not pitch detection or hand tracking independently. It is the fused inference question:

> At time *t*, did the player fret the intended string/fret(s), sound the intended notes, and fail for a diagnosable reason?

This requires calibration, temporal smoothing, confidence estimates, and a feedback policy that avoids overconfident wrong corrections.

## Immediate build recommendation

Start with a greenfield repo using a browser-first architecture, while borrowing ideas from Guitariz and Chordially rather than trying to directly fork a mature app that does not exist.

Suggested first milestone:

- webcam + mic capture
- chord diagram target UI
- MediaPipe hand landmarks
- manual fretboard calibration
- open-chord template matching
- audio chord/note confidence
- red/yellow/green overlay feedback
