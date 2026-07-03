# Initial Architecture Hypothesis

This is a placeholder architecture before the deep research reports land.

## Likely architecture

```mermaid
flowchart LR
  Cam[Webcam] --> CV[Vision pipeline]
  Mic[Microphone] --> Audio[Audio pipeline]
  Lesson[Lesson/Chord Target] --> Fusion[State fusion]
  CV --> Fusion
  Audio --> Fusion
  Fusion --> Feedback[Real-time feedback engine]
  Feedback --> UI[Overlay UI + lesson coach]
  Fusion --> Review[Slow coach / multimodal model review]
  Review --> UI
```

## Real-time path

- Browser or desktop captures audio/video.
- Audio path handles pitch/onset/chord detection locally for low latency.
- Vision path detects guitar/fretboard/fingers locally or via an optimized model.
- Fusion compares detected state against target chord/tab.
- UI highlights correct/incorrect strings, frets, notes, and timing.

## Slow coaching path

A powerful multimodal model can analyze clips, summarize problems, generate practice plans, and explain technique. It may not be the best first component for frame-by-frame low-latency correction unless streaming multimodal latency and cost are acceptable.

## Early risk areas

- Exact finger-to-string/fret assignment from a single webcam angle.
- Polyphonic guitar transcription from laptop microphone.
- Lighting, occlusion, guitar type, tuning, capo, and camera calibration.
- Need for annotated data if existing models are insufficient.
