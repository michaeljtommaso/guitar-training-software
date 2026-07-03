# Real-Time Multimodal Guitar Tutor — Technical Architecture & Build Plan

## 1. Product goal

Build a personal guitar training app that can:

- watch the player in real time via webcam
- listen to guitar audio via microphone or direct input
- identify chords, notes, rhythm, and probable key
- detect wrong string/fret/fingering when teaching an exercise
- provide immediate visual feedback and spoken/text coaching
- highlight what to fix next: finger placement, muted strings, timing, strumming pattern, chord transitions

This is a **multimodal tutoring system**, not just a chord recognizer. It must combine:

- **vision**: hands, fretboard, finger positions, pick/strumming motion
- **audio**: note/chord/onset/pitch/timing estimation
- **music context**: chord progression, key, exercise intent, expected fingering
- **teaching logic**: feedback prioritization, drill generation, progression tracking

---

## 2. Product scope by phase

## Phase 0: Narrow MVP
Focus on beginner acoustic/electric guitar with:

- open chords
- standard tuning
- seated practice position
- front/angled webcam
- mono mic audio
- single-user real-time feedback

### MVP use cases
1. **Chord coach**
   - “Show me G major”
   - App overlays target finger positions and confirms when correct.

2. **Play-along correction**
   - User plays a chord progression.
   - App detects chord timing and flags wrong chord / dead string / missing note.

3. **Strumming/timing coach**
   - App listens for down/up pattern alignment to metronome/backing track.

4. **Lesson mode**
   - App displays next chord, next finger, common mistakes, and progress.

## Phase 1
- bar chords
- capo support
- fingerstyle
- alternate camera angles
- mobile companion
- teacher dashboard / session replay

## Phase 2
- improvisation feedback
- scale position tutoring
- expressive technique recognition: bends, slides, hammer-ons, pull-offs, vibrato
- adaptive curriculum
- multimodal voice tutor with natural conversation

---

## 3. User experience design

## Core UX principles
- feedback must be **instant and sparse**
- show **one correction at a time**
- avoid punishing false positives
- confidence-aware UI: “likely muted B string” is better than wrong certainty
- audio and visual feedback should reinforce each other

## Main screens

### A. Practice home
- Start lesson
- Free play
- Chord trainer
- Scale trainer
- Review mistakes

### B. Real-time lesson screen
Layout:
- live webcam feed with overlay
- chord diagram target panel
- current detected chord
- key / progression panel
- confidence bar
- issue stack: “index finger too far behind fret”, “high E not ringing”
- mini fretboard heatmap
- metronome / tempo status
- optional voice coach button

### C. Session review
- timeline of mistakes
- chord transition latency
- missed strings
- rhythm drift
- “most common fingering issue”
- clips where feedback fired

## Real-time feedback design
Use three layers of feedback:

1. **Immediate micro-feedback** (<300 ms)
   - red/yellow/green string indicators
   - finger halo on misplaced finger
   - “late strum”, “muted G string”

2. **Short coaching feedback** (0.5–2 s)
   - “Rotate wrist slightly”
   - “Ring finger should move to low E, 3rd fret”

3. **Reflective post-phrase feedback**
   - “2/8 chord changes were late”
   - “You consistently missed the B string on C major”

## Interaction model
- default silent visuals while playing
- spoken feedback only on pauses or when user asks
- push-to-talk or voice assistant mode for:
  - “What am I doing wrong?”
  - “Show me slower”
  - “Quiz me on the next chord”

---

## 4. Platform strategy: web vs desktop vs mobile

## Recommended launch order
**Desktop/web-first**, mobile later.

## Web app advantages
- easiest onboarding
- webcam/mic via browser
- fast iteration on overlays and lessons
- deployable with WebRTC + Web Audio + WebGPU/WASM

## Web app limitations
- browser audio stack can be inconsistent
- mobile browser performance/thermal constraints
- camera angle control limited
- lower reliability for heavy on-device multimodal inference

## Desktop app advantages
- better control over low-latency audio/video
- easier hardware acceleration
- can bundle local models
- more reliable for long practice sessions

## Mobile app advantages
- best camera convenience
- likely where users actually practice
- can use phone mounted to observe fretboard

## Mobile limitations
- compute and battery
- harder real-time multi-model inference
- backgrounding / audio session complexity

## Recommendation
- **MVP**: browser app + optional lightweight backend
- **Beta**: Electron/Tauri desktop build for serious users
- **Later**: native mobile companion for capture and review

---

## 5. High-level system architecture

```text
[Browser/Desktop Client]
  ├─ Webcam Capture
  ├─ Microphone / Line-in Capture
  ├─ Real-time UI + Overlay Renderer
  ├─ Local low-latency inference
  │   ├─ Hand/Fretboard tracking
  │   ├─ Audio DSP
  │   ├─ Lightweight chord/note models
  │   └─ Event fusion
  └─ Stream selected features/events to backend

[Realtime Backend]
  ├─ Session orchestration
  ├─ State store (exercise, target chord, calibration, timing)
  ├─ Heavier ML inference
  │   ├─ multimodal tutor model
  │   ├─ vision refinement
  │   ├─ sequence models
  │   └─ feedback ranking
  ├─ Analytics / replay
  └─ content / curriculum service

[Model Layer]
  ├─ Frontier multimodal model (if available)
  ├─ fallback specialized models
  ├─ rules + music theory engine
  └─ evaluation pipeline

[Data Layer]
  ├─ lesson definitions
  ├─ chord/fingering library
  ├─ calibration profiles
  ├─ annotated training data
  └─ telemetry / metrics
```

---

## 6. Realtime multimodal inference strategy

## Key design decision
Do **not** send raw continuous high-rate audio/video to a frontier model and hope it becomes a tutor. Instead:

- run **specialized low-latency perception locally**
- extract structured events/features
- use a frontier multimodal model for:
  - explanation
  - ambiguous reasoning
  - high-level coaching
  - lesson planning
  - replay analysis
  - confidence-aware synthesis of multi-signal evidence

This keeps latency low and cost bounded.

---

## 7. Model architecture options

## Option A: Frontier model path (“Fable 5 Clubs” / equivalent)
Treat **“Fable 5 Clubs”** as an ambiguous frontier vision-language-audio model with real-time API support.

### Best use if available
Use it as a **teaching and reasoning layer**, not the only detector.

### Frontier model responsibilities
- interpret snapshots or short clips plus structured sensor outputs
- answer:
  - “Which finger is likely wrong?”
  - “What is the most probable mistake?”
  - “Explain how to fix this in beginner language”
- generate lesson narration
- summarize session performance
- create adaptive drills from failure patterns
- handle user voice interactions

### Integration requirements
To be practical for this use case, the frontier model must support:
- streaming or near-real-time multimodal input
- video frame input or image sequence input
- audio understanding
- structured tool outputs / JSON mode
- low enough latency for assistant-style feedback
- stable cost at session scale
- privacy/compliance if user video/audio is uploaded

### Why not use it alone
A single frontier model is usually weak at:
- exact fret/string attribution at frame-level precision
- deterministic timing guarantees
- stable sub-200 ms loop closure
- predictable outputs for pedagogy and evaluation
- on-device privacy

### Recommended pattern
**Hybrid architecture**
- local CV/audio models produce:
  - hand landmarks
  - fretboard geometry
  - fingertip-to-string/fret mapping
  - chord posterior
  - onset/timing events
- frontier model consumes:
  - key frames / short clips on demand
  - structured JSON features
  - exercise context
- frontier returns:
  - prioritized corrections
  - natural language coaching
  - lesson adaptation

### Example tool schema sent to frontier model
```json
{
  "exercise": "Switch between G and C, 80 BPM",
  "target_chord": "C_major",
  "visual_state": {
    "left_hand": {
      "finger_assignments": [
        {"finger": "index", "string": 2, "fret": 1, "confidence": 0.91},
        {"finger": "middle", "string": 4, "fret": 2, "confidence": 0.83},
        {"finger": "ring", "string": 5, "fret": 3, "confidence": 0.88}
      ],
      "issues": [
        {"type": "behind_fret_distance", "string": 2, "severity": 0.42}
      ]
    },
    "right_hand": {
      "strum_direction": "down",
      "timing_offset_ms": 86
    }
  },
  "audio_state": {
    "detected_chord": "C_major",
    "missing_pitch_classes": ["E4"],
    "muted_strings": [1],
    "confidence": 0.79
  }
}
```

## Option B: Open-source / on-device fallback
This should be the **default production foundation**, even if a frontier model exists.

### Vision models
1. **Hand landmarks**
   - MediaPipe Hand Landmarker for real-time 21-point landmarks
   - strong choice for browser/mobile and initial desktop MVP

2. **Fretboard detection / geometry**
   - custom object detector or segmentation model
   - detect:
     - neck polygon
     - nut
     - frets
     - string lines
   - candidate models:
     - YOLOv8n / YOLO11n
     - RT-DETR small
     - lightweight segmentation via MobileSAM/FastSAM variant only if needed

3. **Finger-to-string/fret assignment**
   - geometric post-processing over landmarks + fretboard homography
   - optional learned classifier for fingertip contact state

4. **Strumming hand motion**
   - hand landmarks + wrist velocity + pick trajectory
   - simple sequence classifier for down/up/no-strum

### Audio models / DSP
1. **Low-level DSP**
   - onset detection
   - spectral flux
   - harmonic/percussive split if useful
   - energy per band
   - noise gate / denoise

2. **Pitch/note estimation**
   - CREPE-like pitch estimator for single prominent pitch cases
   - Basic Pitch for polyphonic transcription and note candidates
   - for low-latency online use, consider chunked inference and lighter note-event head

3. **Chord recognition**
   - chroma + temporal model baseline
   - CRNN / conformer-lite over log-mel + chroma
   - use a “Noise / silence / invalid chord” class

4. **String-level validation**
   - infer expected pitch classes from target fingering
   - compare observed spectrum / note set against expected open+fretted strings

### Fusion / tutoring logic
- finite-state exercise engine
- probabilistic event fusion
- rules engine with confidence thresholds
- optional small temporal transformer over fused event stream

---

## 8. Vision pipeline in detail

## Input assumptions
- camera sees torso, both hands, and most of fretboard
- 720p at 30 fps is enough for MVP
- user calibrates guitar neck endpoints once at session start

## Vision steps

### 1. Frame acquisition
- 720p/30fps webcam
- process full frame at low rate and ROI crops at higher rate

### 2. Calibration
At session start:
- detect guitar body + neck
- ask user to align guitar in overlay
- estimate fretboard homography
- optionally ask for open string pluck sequence for string mapping

### 3. Tracking
- run hand landmarks continuously
- maintain two ROIs:
  - fretting hand ROI
  - strumming hand ROI

### 4. Fretboard localization
- detect neck corners, nut, bridge direction
- estimate strings as line family
- frets as transverse line family
- warp into normalized fretboard coordinate system

### 5. Fingertip contact inference
For each fingertip:
- project fingertip to normalized fretboard
- estimate nearest string
- estimate fret cell
- determine contact/hover
- compute behind-fret distance
- detect accidental muting of adjacent strings

### 6. Chord fingering matching
Compare inferred finger assignment to target chord template:
- expected finger/string/fret
- allowed alternate fingerings
- tolerance windows
- bar chord special handling

### 7. Strumming analysis
- detect down/up stroke
- estimate stroke timing relative to beat grid
- determine whether target strings were likely intended

---

## 9. Audio pipeline in detail

## Capture
- microphone via browser `getUserMedia()` or native audio input
- process in **AudioWorklet** for low latency on web
- sample rate 48 kHz preferred
- frame size 128/256 samples at capture layer; aggregate into 20–40 ms analysis windows

## Preprocessing
- AGC off if possible
- high-pass filter to remove rumble
- optional denoise
- level normalization
- voice suppression if user speaks during play, or separate speech channel if available

## Audio tasks

### A. Onset detection
Needed for:
- strum timing
- phrase segmentation
- chord change alignment

### B. Chord estimation
Estimate:
- chord class
- confidence
- invalid/noise/silence

Use:
- log-mel spectrogram
- chroma/CQT features
- short temporal context (0.5–2 s)

### C. Note set estimation
Estimate:
- likely sounding notes
- missing expected notes
- extra accidental notes
- muted strings probability

### D. Rhythm / tempo alignment
- compare detected onsets to metronome/lesson beat grid
- detect early/late strums and skipped beats

### E. Tuning support
- open-string tuner mode
- per-string pitch deviation
- useful for session setup and better model performance

---

## 10. Sensor fusion and tutoring engine

## Why fusion matters
Vision alone cannot tell whether a fretted note rang cleanly.
Audio alone cannot tell which finger caused the issue.
Fusion lets the tutor say:
- “Your ring finger is placed correctly, but the B string is muted by your index finger”
instead of generic feedback.

## Fusion state
Maintain a real-time session state:
- current lesson step
- target chord/notes
- recent chord posterior history
- current finger placement posterior
- recent onsets
- timing offset
- camera calibration state
- confidence estimates

## Fusion logic examples

### Example 1: Wrong chord despite correct visual fingering
- vision says chord shape ~= C major
- audio missing E pitch
- probable issue: muted open high E or weak strum coverage
- feedback: “Shape is almost correct; let the high E ring”

### Example 2: Correct chord sound, alternate fingering
- vision differs from canonical lesson fingering
- audio correct
- if beginner lesson requires exact fingering, warn softly
- otherwise accept as valid alternate

### Example 3: Chord transition late
- target change at beat 3
- audio change occurs 240 ms late
- vision shows hand movement started late
- feedback: “Prepare the index finger earlier before beat 3”

## Tutoring policy
Rank candidate feedback by:
1. confidence
2. pedagogical importance
3. expected user benefit
4. non-repetition
5. actionability

Do not fire more than one major correction every ~1–2 seconds while user is playing.

---

## 11. Latency budget

## UX targets
- visual overlays: **<100 ms perceived lag**
- chord detection update: **150–300 ms**
- timing feedback: **<150 ms after onset**
- natural language coaching: **0.5–2.0 s**, preferably on pauses
- end-to-end core loop for corrective hint: **<250 ms** for deterministic hints

## Proposed budget

### Vision loop
- capture/frame transfer: 10–20 ms
- hand landmarks: 8–20 ms
- fretboard geometry/tracking: 5–15 ms amortized
- fingertip assignment/post-process: 2–5 ms
- overlay render: 8–16 ms

**Vision total:** ~35–70 ms

### Audio loop
- capture buffer accumulation: 20–40 ms
- DSP features: 5–10 ms
- onset/chord micro-model: 10–30 ms
- smoothing/fusion: 5–10 ms

**Audio total:** ~40–90 ms

### Feedback loop
- fusion/state update: 5–15 ms
- rule-based immediate feedback: 5–10 ms

**Immediate feedback total:** ~60–120 ms after enough signal context exists

### Frontier model path
- event packaging: 10–20 ms
- network RTT: 50–200+ ms
- inference: 200–1000+ ms
- response render/TTS: 50–200 ms

**Frontier tutor total:** ~300 ms to 2 s+

Conclusion:
- use local models for corrections
- use frontier model for explanation and adaptive tutoring

---

## 12. Model/tool choices

## Recommended MVP stack

### Front-end
- React / Next.js or Vite
- Canvas/WebGL/WebGPU overlay
- WebRTC / MediaDevices for capture
- Web Audio API + AudioWorklet
- Zustand/Redux for session state

### Desktop variant
- Tauri preferred over Electron if native integration needed and bundle size matters
- Rust or Python backend service for local inference

### Vision
- MediaPipe Hand Landmarker for browser-compatible real-time hands
- YOLO-nano/small fretboard detector
- OpenCV for homography and geometric mapping

### Audio
- librosa/Essentia for offline experimentation
- real-time DSP in WebAssembly or native C++/Rust
- Basic Pitch-inspired or adapted note model for polyphonic note hints
- lightweight chord CRNN / temporal CNN

### ML serving
- ONNX Runtime / TensorRT / Core ML / TFLite depending platform
- Web: ONNX Runtime Web + WebGPU where possible

### Tutor/reasoning
- “Fable 5 Clubs” if available and real-time multimodal capable
- otherwise equivalent frontier VLA/VLM live API
- fallback LLM with structured inputs for delayed explanations only

---

## 13. Datasets and data strategy

## Public datasets to bootstrap
I checked several relevant public resources:

- **MediaPipe hand landmark model documentation**: suitable for real-time hand landmarks in image/video/live stream, outputs handedness and 21 landmarks.
- **Basic Pitch**: lightweight, polyphonic audio-to-MIDI, reported as fast and efficient.
- **UCI Guitar Chords Finger Positions**: 2,633 chord finger-position definitions.
- **Isolated Guitar Chords dataset (Hugging Face)**: isolated chord recordings with a Noise class for robustness.
- **IDMT-SMT-GUITAR**: guitar transcription dataset with techniques and note events.
- **GuitarSet**: rich annotations including string/fret positions, chords, beats, downbeats, and style.

## What each dataset is good for

### GuitarSet
Use for:
- note/chord transcription
- timing alignment
- string/fret supervision
- evaluation of audio note/chord models

Limitations:
- not webcam video
- not pedagogy/error labels

### IDMT-SMT-GUITAR
Use for:
- note event robustness
- techniques
- polyphonic transcription experiments

### UCI Guitar Chords Finger Positions
Use for:
- chord library
- fingering template generation
- alternate fingering ontology

### Isolated Guitar Chords
Use for:
- initial chord classifier pretraining
- robustness to pauses/noise

### Generic hand/object datasets
Use for:
- pretraining hand-object reasoning if needed
- but not enough for guitar-specific fingertip/fret contact

---

## 14. Custom dataset requirements

Public data is not enough for the full tutor. You will need a **proprietary multimodal guitar tutoring dataset**.

## Required annotation types

### Vision annotations
- guitar neck polygon
- fretboard corners
- string line estimates
- fret line estimates
- left/right hand boxes
- 21+ hand landmarks
- fingertip-to-string assignment
- fingertip-to-fret assignment
- contact vs hover
- occlusion labels
- camera angle metadata

### Audio annotations
- chord labels over time
- onset times
- beat/downbeat
- note events
- muted/dead strings
- buzzing / fret noise
- tuning offset
- strum direction if inferable from multimodal data

### Pedagogical annotations
- target exercise
- correct fingering variants
- common mistake type:
  - wrong fret
  - wrong string
  - finger collapse
  - accidental muting
  - insufficient pressure
  - late transition
  - strumming too many/few strings
- recommended correction text
- severity
- whether issue should interrupt or defer

## Data collection plan

### Stage 1: Controlled data
Record 20–50 players across skill levels:
- front and fretboard-side camera angles
- lav/room mic + optional DI
- open chords, transitions, scales, strumming patterns
- deliberate errors scripted by instructors

### Stage 2: In-the-wild data
Collect opt-in home practice sessions:
- varied lighting/backgrounds
- different guitars and bodies
- partial visibility
- natural mistakes

### Stage 3: Hard-negative mining
Capture failure cases:
- tattoos/gloves
- low light
- dark fretboards
- capos
- alternate tunings
- fast strumming blur
- occluded fingers

## Annotation pipeline
- auto-label with hand landmarks + fretboard tracker
- human correction UI for fingertip/fret/string labels
- active learning to prioritize uncertain clips
- teacher review for pedagogical labels

---

## 15. Annotation tooling

Build an internal annotation tool with:
- synchronized video + waveform + spectrogram
- frame stepping
- overlay for fretboard grid
- fingertip reassignment UI
- audio note/chord timeline editing
- mistake taxonomy tagging
- model confidence display for active learning

Store annotations in:
- video metadata JSON / parquet
- JAMS or similar for music annotations
- COCO-like format for object/keypoint labels
- lesson/error taxonomy as structured JSON

---

## 16. Evaluation plan

## Online product metrics
- daily practice minutes
- correction acceptance rate
- false feedback complaint rate
- lesson completion
- improvement in chord transition latency
- reduction in repeated error types

## ML evaluation by component

### Vision
- hand landmark reprojection error
- fretboard homography error
- fingertip-to-string accuracy
- fingertip-to-fret accuracy
- contact-state F1
- strum direction accuracy

### Audio
- chord recognition accuracy / weighted chord symbol recall
- onset F1
- note precision/recall
- timing offset MAE
- muted-string detection AUROC/F1

### Fusion/tutoring
- mistake classification accuracy
- top-1 / top-3 feedback correctness
- calibration error by confidence bucket
- user-rated usefulness of feedback
- interruption regret rate

## Human evaluation
Have guitar teachers label:
- Was the correction correct?
- Was it the most important correction?
- Was it phrased helpfully?
- Would it help a beginner fix the issue faster?

## Acceptance thresholds for MVP
- hand/fret assignment accuracy > 85% on supported setup
- open-chord classification > 90% in clean conditions
- timing MAE < 100 ms for strums
- false critical feedback < 5% of lessons
- teacher agreement on top feedback > 75%

---

## 17. Curriculum and lesson engine

## Lesson representation
Each lesson step should define:
- target chord/scale/exercise
- accepted fingerings
- expected strings
- tempo
- timing pattern
- prerequisites
- common mistakes
- feedback priority rules
- advancement criteria

## Example lesson schema
```yaml
id: open_chords_c_major
target:
  chord: C_major
accepted_fingerings:
  - fingers:
      index: {string: 2, fret: 1}
      middle: {string: 4, fret: 2}
      ring: {string: 5, fret: 3}
expected_strings: [2,3,4,5,6]
avoid_strings: [1]
success_criteria:
  hold_time_ms: 1200
  min_audio_confidence: 0.8
  max_muted_strings: 0
feedback_priority:
  - wrong_fret
  - accidental_muting
  - missing_string
  - late_strum
```

---

## 18. Realtime backend design

## Services
1. **Session service**
   - auth
   - practice state
   - calibration
   - current lesson

2. **Realtime fusion service**
   - receives event stream from client
   - performs sequence smoothing and feedback ranking

3. **Tutor service**
   - calls frontier multimodal model if enabled
   - generates explanations/drills/session summaries

4. **Content service**
   - chords, scales, lessons, exercise graphs

5. **Analytics service**
   - stores events, clip references, outcomes

## Transport
- client-side low-latency perception should not depend on backend
- backend communication via WebSocket
- only send:
  - compressed features
  - sparse key frames
  - short clips when needed
  - confidence-tagged event packets

This reduces bandwidth and privacy exposure.

---

## 19. Frontier model integration plan

## Role in architecture
Use the frontier model in four modes:

### Mode 1: Conversational coach
User asks:
- “Why does my C chord sound bad?”
- “Explain bar chords”
- “What should I practice next?”

Inputs:
- recent event timeline
- detected errors
- optional selected clip

### Mode 2: Ambiguity resolver
When local models disagree:
- audio says correct chord
- vision says wrong fingering
- app asks frontier model to inspect 1–3 frames + structured data
- returns ranked hypotheses, not hard truth

### Mode 3: Session summarizer
After practice:
- summarize recurring issues
- recommend next drills
- convert telemetry to actionable lesson plan

### Mode 4: Lesson/content generator
Given skill level and prior errors:
- generate chord transition drills
- create spoken cues
- personalize difficulty

## Safeguards
- frontier model never directly controls immediate red/green correctness loop
- all feedback shown to user must carry confidence
- allow model only to propose from a bounded feedback taxonomy for real-time mode

---

## 20. Open-source fallback architecture

If no capable frontier model exists, use this stack:

- local rule engine for immediate corrections
- small instruction-tuned text model or standard cloud LLM for non-real-time explanations
- teacher-authored explanation templates with slot filling

Example:
- Error code: `accidental_muting_high_e`
- Template:
  - “Your shape is close. The high E string is being muted, likely by your index finger. Curve that finger more and leave space for the string to ring.”

This yields strong pedagogy without needing live giant-model video reasoning.

---

## 21. Security, privacy, and trust

## Privacy stance
Default to **local-first perception**.
Only upload:
- opt-in clips
- selected frames for advanced coaching
- anonymized telemetry where possible

## Sensitive data
- user video/audio in home environments
- biometric hand images
- speech
- practice history

## Privacy controls
- “Local only mode”
- “Use cloud coach for better explanations”
- delete session recordings
- explicit consent for dataset contribution

---

## 22. Major risks

## Technical risks
1. **Occlusion**
   - fretting fingers block strings/frets
2. **Camera angle variability**
   - inaccurate geometric mapping
3. **Audio ambiguity**
   - room noise, speech, backing track interference
4. **Latency drift**
   - browser/device variance
5. **Model confidence mismatch**
   - overconfident wrong feedback damages trust
6. **Beginner error diversity**
   - many failures aren’t obvious from only one modality
7. **Generalization**
   - different guitars, left-handed players, capos, tunings

## Product risks
1. feedback too noisy/annoying
2. setup friction too high
3. users want “teacher empathy”, not just diagnostics
4. false negatives more acceptable than false positives; product may feel timid if thresholds too strict

## Mitigations
- constrained MVP setup
- explicit calibration
- confidence thresholds
- one correction at a time
- heavy replay analysis before aggressive real-time correction
- teacher-in-the-loop labeling and review

---

## 23. MVP roadmap

## Milestone 1: Feasibility prototype
**Goal:** prove real-time hand + fretboard + chord loop

Deliverables:
- webcam overlay
- hand landmarks
- manual/assisted fretboard calibration
- mic capture
- basic chord recognition for 8–10 open chords
- UI showing target vs detected chord

Success criteria:
- usable in clean indoor lighting
- <300 ms chord feedback

## Milestone 2: Deterministic correction engine
Deliverables:
- finger/string/fret mapping
- immediate mistakes:
  - wrong fret
  - wrong string
  - muted string
  - late strum
- simple lesson engine
- session replay timeline

Success criteria:
- teacher agrees corrections are mostly right in controlled tests

## Milestone 3: Hybrid tutor
Deliverables:
- optional frontier model integration
- natural-language explanation
- adaptive drill suggestions
- post-session summaries

Success criteria:
- explanations rated helpful by users/teachers

## Milestone 4: Data flywheel
Deliverables:
- annotation tooling
- opt-in clip collection
- active learning loop
- retraining pipeline

Success criteria:
- measurable improvement across difficult setups

## Milestone 5: Beta product
Deliverables:
- polished lessons
- auth/profiles
- progress tracking
- desktop build
- privacy modes
- crash/latency monitoring

---

## 24. Suggested team composition

For a serious build:
- 1 product designer
- 1 frontend engineer
- 1 realtime audio/DSP engineer
- 1 CV/ML engineer
- 1 backend/platform engineer
- 1 music pedagogy advisor / guitarist instructor
- part-time annotators / QA musicians

A single strong full-stack/ML founder can prototype Milestone 1–2, but polishing accuracy and pedagogy will need specialists.

---

## 25. Suggested GitHub repo structure

```text
guitar-tutor/
├─ apps/
│  ├─ web/
│  ├─ desktop/
│  └─ annotation-tool/
├─ services/
│  ├─ realtime-gateway/
│  ├─ fusion-engine/
│  ├─ tutor-service/
│  └─ analytics/
├─ models/
│  ├─ vision/
│  ├─ audio/
│  ├─ fusion/
│  └─ notebooks/
├─ data/
│  ├─ schemas/
│  ├─ lesson-content/
│  └─ sample-assets/
├─ docs/
│  ├─ architecture.md
│  ├─ mvp-roadmap.md
│  ├─ datasets.md
│  ├─ evaluation.md
│  ├─ privacy.md
│  └─ annotation-guidelines.md
└─ infra/
   ├─ docker/
   ├─ terraform/
   └─ ci/
```

---

## 26. Concrete build plan

## Sprint 1–2
- build webcam + mic capture shell
- integrate MediaPipe hands
- add AudioWorklet capture and spectrogram
- create manual fretboard calibration UI
- implement static chord diagram renderer

## Sprint 3–4
- detect fingertip positions in normalized fretboard coordinates
- build open chord template matcher
- implement onset/chord baseline audio model
- create first real-time overlay feedback loop

## Sprint 5–6
- fuse audio and vision
- add lesson state machine
- implement session logging and replay
- test with 5–10 guitarists

## Sprint 7–8
- collect controlled data
- train/refine fretboard detector + finger contact classifier
- improve chord robustness
- add confidence-aware feedback ranking

## Sprint 9–10
- integrate frontier tutor API for explanation/summaries
- create fallback template tutor
- add privacy settings and clip upload gating

## Sprint 11–12
- teacher evaluation
- latency optimization
- release internal alpha

---

## 27. Final recommendation

### Best architecture choice
Build a **hybrid system**:

- **local/on-device specialized perception** for all hard real-time corrections
- **frontier multimodal model** for explanation, adaptive tutoring, session summaries, and ambiguous cases
- **rules + music theory engine** to guarantee determinism and pedagogical consistency

### Why this is the right bet
A pure frontier-model solution will be:
- too latent
- too costly
- too nondeterministic
- too weak at exact fret/string attribution

A pure classical pipeline will feel:
- rigid
- less conversational
- weaker at personalized coaching

The hybrid approach gets both:
- precise real-time correction
- natural tutoring quality

---

## 28. Short answer on “Fable 5 Clubs”

If **“Fable 5 Clubs”** is a frontier multimodal vision-language-audio model with live streaming support, use it as:

- a **reasoning/tutor layer**
- a **multimodal explainer**
- an **adaptive curriculum generator**

Do **not** rely on it alone for:
- frame-accurate fingering detection
- sub-200 ms feedback
- deterministic grading

If it is not available or lacks real-time multimodal APIs, the fallback open-source stack above is fully viable for an MVP.

---

## Completion summary

### What I did
- Designed a complete front-to-back implementation strategy for a real-time multimodal guitar tutor.
- Grounded recommendations with current public references for real-time hand tracking, low-latency browser audio processing, and relevant guitar datasets.

### What I found / accomplished
- A **hybrid architecture** is the best approach:
  - local CV/audio models for deterministic low-latency feedback
  - frontier multimodal model for explanation and adaptive tutoring
- Strong bootstrap components exist:
  - MediaPipe Hand Landmarker for live hand tracking
  - Basic Pitch-style polyphonic note estimation
  - GuitarSet / IDMT-SMT-GUITAR / isolated chord datasets for audio bootstrapping
  - UCI chord fingering dataset for chord-template ontology
- The biggest gap is **guitar-specific multimodal tutoring data** with pedagogical error labels; this must be collected.

### Files created or modified
- No local files were created in `/root` because the available toolset in this run did not include filesystem write tools.
- The deliverable is provided inline as Markdown.

### Issues encountered
- “Fable 5 Clubs” appears ambiguous/not directly verifiable as a named product, so I treated it as a generic frontier multimodal model and documented the required integration assumptions and fallback plan.
