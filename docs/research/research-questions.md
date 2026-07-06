# Research Questions

## Existing products

- Which apps currently give real-time guitar feedback from microphone audio?
- Which apps use camera/vision for fingering, fretboard, or posture correction?
- Do products such as Yousician, Simply Guitar, Uberchord, Rocksmith+, Fender Play, Chordify, Fret Zealot, or smart-guitar tools support the target experience?
- What are their limitations, pricing, platforms, and technical clues?

## Open source and research

- Is there an end-to-end open-source real-time guitar tutor using audio + vision?
- What GitHub projects exist for:
  - guitar chord recognition
  - pitch detection / onset detection
  - polyphonic transcription
  - tab/audio alignment
  - fretboard detection
  - hand/finger tracking on instruments
  - WebRTC audio/video ML inference
- What licenses and maturity levels do these projects have?

## Technical feasibility

- Can laptop webcam infer exact fret/string/finger placements reliably?
- What extra calibration markers or camera angles make the problem easier?
- What should run locally vs in a cloud model?
- What latency budgets are required?
- What datasets exist for training/evaluating guitar fingering and transcription?

## Build plan

- What is the fastest MVP that is genuinely useful for Michael learning guitar?
- What stack should be used: web app, desktop app, mobile, Python backend, WebAudio, ONNX, MediaPipe, PyTorch, etc.?
- What should be delegated to a frontier multimodal model versus deterministic/audio/CV components?
