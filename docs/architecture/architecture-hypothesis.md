# Initial Architecture Hypothesis

This is a placeholder architecture before the deep research reports land.

## Likely architecture

```mermaid
flowchart LR
  Cam[Webcam] --> CV[Vision pipeline]
  DI[DI / interface input] --> Select[Input preference: DI first, mic fallback]
  Mic[Microphone fallback] --> Select
  Select --> Audio[Dry analysis pipeline]
  Lesson[Lesson/Chord Target] --> Fusion[State fusion]
  CV --> Fusion
  Audio --> Fusion
  Fusion --> Feedback[Real-time feedback engine]
  Feedback --> UI[Overlay UI + lesson coach]
  Fusion --> Review[Slow coach / multimodal model review]
  Review --> UI
```

## Real-time path

- Browser or desktop captures video plus the best available guitar audio source: **direct DI/interface first, external mic second, built-in mic last**.
- Audio path handles pitch/onset/chord detection locally for low latency from the dry/clean signal.
- Vision path detects guitar/fretboard/fingers locally or via an optimized model.
- Fusion compares detected state against target chord/tab.
- UI highlights correct/incorrect strings, frets, notes, and timing.

## Slow coaching path

A powerful multimodal model can analyze clips, summarize problems, generate practice plans, and explain technique. It may not be the best first component for frame-by-frame low-latency correction unless streaming multimodal latency and cost are acceptable.

## Optional tone/amp monitoring path

The amp-modeling research adds a parallel **tone/pedal engine** without changing the core correctness loop:

```mermaid
flowchart LR
  In[Preferred DI, else mic fallback] --> Split[Dry/wet split]
  Split --> Dry[Dry analysis path]
  Dry --> Audio[Pitch/chord/onset detection]
  Audio --> Fusion
  Split --> Wet[Wet monitoring path]
  Wet --> Pedals[Pedals / effects]
  Pedals --> Amp[Amp model]
  Amp --> Cab[Cab IR]
  Cab --> Out[Headphones / monitors]
```

Correctness should stay on the dry/clean analysis path; amp/cab/pedal processing is for motivating, low-latency monitoring and practice feel. See [`product-vision-direct-capture-tone.md`](../product/product-vision-direct-capture-tone.md) and [`amp-modeling-and-tone-engine-research.md`](../research/amp-modeling-and-tone-engine-research.md).

## Early risk areas

- Exact finger-to-string/fret assignment from a single webcam angle.
- Polyphonic guitar transcription from laptop microphone.
- Lighting, occlusion, guitar type, tuning, capo, and camera calibration.
- Need for annotated data if existing models are insufficient.
