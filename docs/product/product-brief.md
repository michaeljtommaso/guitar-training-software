# Product Brief — Real-Time Multimodal Guitar Tutor

## Goal

Create personal guitar training software that teaches guitar by watching and listening in real time. The system should tell the learner whether the correct notes, strings, frets, chord shapes, timing, and hand positions are being played.

## Core user experience

1. User opens app and selects a lesson, chord, scale, song, or drill.
2. App captures webcam + the cleanest available guitar audio source: **direct DI/interface input first**, then external mic, then built-in mic fallback.
3. UI displays the target chord/scale/tab and live detected playing state.
4. App highlights mistakes:
   - wrong finger on fret/string
   - missing note or muted string
   - wrong string struck
   - wrong chord or key
   - rhythm/timing drift
5. App gives corrective feedback and adapts difficulty.

## Key product requirements

- Real-time enough for practice feedback, ideally <100 ms for audio note/chord feedback and <250 ms for visual pose/fret feedback.
- Defaults to direct DI / Hi-Z / interface capture when available, because that is the most reliable source for tuner, pitch, chord, onset, and timing analysis.
- Falls back gracefully to commodity laptop webcam/mic when no suitable interface is connected.
- Includes digital tone/pedal software as a product feature: amp/pedal/cab processing for monitoring and musical feel while the tutor analyzes the dry/clean signal.
- Privacy-first/local-first where possible.
- Beginner-friendly chord learning as MVP.
- Architecture should support future song/tab following and full coaching.

## Major unknowns to research

- Does an open-source app already do end-to-end guitar vision + audio coaching?
- Which commercial products already solve pieces of this?
- How reliable can webcam-only fret/finger detection be?
- How difficult is polyphonic guitar transcription in noisy room audio?
- Whether a frontier multimodal model can handle low-latency coaching directly, or should be used for slower explanation/review while local models handle real time.
