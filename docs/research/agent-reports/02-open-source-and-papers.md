# Deep research report: open-source building blocks for a real-time guitar trainer using **audio + vision**

## Executive summary

**Short answer:** I did **not** find a mature open-source app that already delivers the full target product: **real-time guitar training with both** (1) **audio transcription/chord/note correctness** and (2) **computer-vision-based fret/string/finger placement verification**, with polished feedback comparable to Rocksmith/Yousician. The closest open-source projects are all **partial** or **prototype-stage**:

- **Vision-first real-time chord tutor:**  
  [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) (“Chordially”) uses **ArUco + MediaPipe** for real-time chord feedback, but no robust audio transcription layer.  
- **Multimodal research prototype:**  
  [`davidshavin4/Learning-Guitar-with-Deep-Learning`](https://github.com/davidshavin4/Learning-Guitar-with-Deep-Learning) explicitly fuses **audio spectrograms + left-hand visual crops**, but is only **5 commits** and looks like a class/research project.  
- **Video+audio tab generation prototype:**  
  [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) and the paper **TapToTab** target video-based tab generation from audio+vision, but the repo is a **6-commit messy R&D prototype** and not a training app.  
- **Audio-first learning app:**  
  [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) is the strongest polished OSS **music-learning web app**, but it is **audio/theory oriented** (Madmom chord recognition, Demucs separation, tuner, fretboard) rather than vision-based fingering verification.  
- **Real-time note/fretboard trainer:**  
  [`orhun/tuitar`](https://github.com/orhun/tuitar) does real-time note tracking/tuning and fretboard visualization, but no camera/CV.

So the best answer is: **no, not as a mature OSS end-to-end app**. But the building blocks are now good enough that a practical MVP is realistic.

---

## 1) Closest open-source apps / prototypes

| Project | Relevance | Stack | License | Activity / maturity | What it proves | Integration notes |
|---|---|---|---|---|---|---|
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | Closest **vision-based real-time tutor** | Python, OpenCV, **MediaPipe**, **ArUco** markers, CSV chord library | Not clearly exposed in extract | **24 commits**; prototype/student-project feel | Real-time hand tracking + mapped fretboard + chord matching is feasible in OSS | Good starting point for **left-hand correctness**; weak on audio, uses markers, likely brittle in natural settings. [Repo extract] |
| [`davidshavin4/Learning-Guitar-with-Deep-Learning`](https://github.com/davidshavin4/Learning-Guitar-with-Deep-Learning) | Closest explicit **audio+vision fusion** | Python, CNNs, spectrogram pipeline, left-hand detection/cropping | Not exposed | **5 commits**; very immature | Multimodal architecture: raw guitar audio → spectrograms + hand pose crop → fused classifier | Valuable as a concept, not a base product. Likely needs total rebuild. [Repo extract] |
| [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) | Closest to **video+audio tab generation** | macOS app / Xcode project / CoreML-style packaging implied | `LICENSE` file present; exact license not exposed in extract | **6 commits**; explicitly “messy prototype” | Video-based guitar tab generation from fretboard CV + audio analysis | Strong proof-of-concept direction; not product-ready. Connects directly to **TapToTab** paper. [Repo](https://github.com/carlosmbe/TappyTabs_TestCode), [Paper](https://arxiv.org/abs/2409.08618) |
| [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) | Most polished **open-source guitar learning web app** | React/TS frontend, FastAPI backend, **Madmom** chord recognition, **Demucs**, tuner, WebSockets, PWA | **MIT** | **247 commits**, release **v1.7.0** | Good OSS baseline for product UX, audio features, theory/training UI | Missing camera-based fingering validation, but strongest **product shell**. [Repo extract] |
| [`orhun/tuitar`](https://github.com/orhun/tuitar) | Best real-time **note/fretboard training** OSS tool | Rust, Ratatui, ESP32 firmware/hardware | **Apache-2.0 or MIT** | **176 commits**, 1 release, prototype but active | Real-time note tracking + virtual fretboard + song/scales modes | Strong low-latency note/fretboard UX ideas; no CV. [Repo extract] |
| [`iamdey/raf`](https://github.com/iamdey/raf) | Open-source song practice UI | Web, alphaTab, PixiJS, TypeScript | `COPYING` present; exact license not exposed in extract | **16 commits**, “very early stage” | Progressive tab display + song practice | Useful only as UI inspiration; no audio/CV feedback. [Repo extract] |
| [`djbacad/guitar-chord-recognition`](https://github.com/djbacad/guitar-chord-recognition) | Real-time **vision-only chord classification** | TensorFlow, Keras, transfer learning, EfficientNetV2-style CV | Not exposed | **28 commits**; prototype | Webcam/video chord class prediction is feasible | Useful as visual chord classifier baseline; no explicit string/fret geometry reasoning. [Repo extract] |
| [`akshaybahadur21/Guitar-Learner`](https://github.com/akshaybahadur21/Guitar-Learner) | Older/simple chord-classifier prototype | Python scripts, dataset builder, trainer | `LICENSE` file present | **5 commits** | Basic guitar chord detection/classification demo | Likely too primitive for modern use. [Repo extract] |
| [`1j01/guitar`](https://github.com/1j01/guitar) | Browser-based fretboard/tab UX | Web app, tablature parser, guitar synth, tuna audio effects | `LICENSE` present; exact type not exposed in extract | **102 commits** | Browser UX for fretboard/tab interaction | Good for UI ideas if building a browser-first practice surface. [Repo extract] |

**Conclusion on existing apps:**  
The **closest thing to the exact requested product** is probably a **hybrid of**:

- **Guitariz** for the app shell and audio-analysis UX, plus
- **Chordially** for fretboard/hand tracking, plus
- **Basic Pitch / GuitarSet / FretNet-style models** for note/tab inference.

No single OSS repo already cleanly combines those.

---

## 2) Best audio/transcription building blocks

### A. Real-time or near-real-time audio transcription / pitch / chord layers

| Project | Use | Stack | License | Activity / maturity | Why it matters |
|---|---|---|---|---|---|
| [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) | **Polyphonic audio-to-MIDI** / note events | Python; TF/CoreML/TFLite/ONNX runtimes | **Apache-2.0** | **266 commits**, **8 releases**, used by **257** repos in extract | Probably the best pragmatic OSS note-transcription layer for guitar MVPs. Works best on one instrument at a time. Backed by paper “A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation.” [Repo extract], [Paper](https://arxiv.org/abs/2203.09893) |
| [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts) | Browser/Node AMT | TypeScript / npm | License not explicitly exposed in extract, but sibling project tracks Basic Pitch | Mature sibling, browser-friendly | Important if you want **browser/WebRTC** inference. Accepts Web Audio-compatible formats and mirrors Python functionality. [Repo extract] |
| [`cwitkowitz/amt-tools`](https://github.com/cwitkowitz/amt-tools) | Research/training framework for AMT | PyTorch | `LICENSE.txt` present | **185 commits** | Best framework if you want to train/customize guitar transcription models rather than just consume them. [Repo extract] |
| [`cwitkowitz/guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition) | Guitar tablature transcription with playability constraints | PyTorch + amt-tools | `LICENSE.txt` present | **74 commits** | Valuable because guitar training needs **playable string/fret outputs**, not just pitches. [Repo extract], [Paper](https://arxiv.org/abs/2204.08094) |
| [`cwitkowitz/guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous) | **FretNet** / continuous-valued pitch contour streaming for guitar tabs | PyTorch + amt-tools | `LICENSE.txt` present | **93 commits** | One of the strongest guitar-specific tab-transcription research codebases. [Repo extract], [Paper link in repo](https://arxiv.org/abs/2212.03023) |
| [`trimplexx/music-transcription`](https://github.com/trimplexx/music-transcription) | CRNN guitar tab transcription from polyphonic audio | PyTorch, CQT, GRU | **MIT** | **36 commits**, **12 stars** | Strong recent repo with explicit GuitarSet performance claim (**0.8736 MPE F1**). [Repo extract] |
| [`marl/crepe`](https://github.com/marl/crepe) | Monophonic pitch tracking | Python / CNN | **MIT** | **85 commits**, 5 releases | Useful for single-note mode, tuning, bends, vibrato, or isolated-string scenarios; not enough alone for polyphonic strumming. [Repo extract] |
| [`CPJKU/madmom`](https://github.com/CPJKU/madmom) | Onset/beat/chord MIR toolkit | Python | BSD code, but **model/data files CC BY-NC-SA 4.0** | **1,753 commits** | Excellent for onset detection, beat tracking, some online/live pipelines; licensing caveat matters for commercial use. [Repo extract] |
| [`MTG/essentia`](https://github.com/MTG/essentia) | MIR/DSP/chroma/chord/onset features | C++ + Python bindings | **AGPLv3** | Mature library | Very strong DSP/MIR toolbox; AGPL may be a blocker depending on distribution model. [Repo extract] |

### Audio takeaways

- For a **real product MVP**, **Basic Pitch** is the strongest starting point for polyphonic note events, especially if you can isolate guitar or ensure solo-guitar input.  
- For **guitar-specific playable tab outputs**, the **Cwitkowitz stack** (amt-tools + inhibition/FretNet repos) is the best research path.  
- For **live rhythm feedback**, **Madmom** is especially useful for **onset/beat** layers, though its model license can matter.  
- For **browser-first**, `basic-pitch-ts` is a major enabler.

---

## 3) Best computer-vision building blocks

### A. Hand / finger / pose tracking

| Project | Use | Stack | License | Activity / maturity | Integration notes |
|---|---|---|---|---|---|
| [`google-ai-edge/mediapipe`](https://github.com/google-ai-edge/mediapipe) | Real-time hand landmarks / pose / on-device CV | C++ / Python / Android / iOS / Web | Apache-2.0 indicated in repo extracts | Large mature project; official docs moved to developers.google.com | Default choice for **hand landmarks** in webcam/browser/mobile setups. Not guitar-specific; you must map landmarks to strings/frets yourself. [Repo extract] |
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | Guitar-specific hand+fretboard mapping | Python, OpenCV, MediaPipe, ArUco | Not exposed | **24 commits** | Good concrete example of using MediaPipe hands + explicit fretboard geometry. [Repo extract] |
| [`djbacad/guitar-chord-recognition`](https://github.com/djbacad/guitar-chord-recognition) | Visual chord classification | TF/Keras/CNN | Not exposed | **28 commits** | Good if you want classification by image rather than geometry reasoning. [Repo extract] |
| [`omatsui/guitar-posture-analyzer`](https://github.com/omatsui/guitar-posture-analyzer) | Posture analysis | MediaPipe Pose + logistic regression | Not extracted in detail | Search result suggests real-time posture QA | Useful extra feature for teaching ergonomics, but not fingering correctness. [Search](https://github.com/omatsui/guitar-posture-analyzer) |

### B. Fretboard / string / instrument localization

| Project | Use | Notes |
|---|---|---|
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | ArUco-based fretboard mapping | Best concrete OSS example found for **explicit fretboard calibration**. Great for controlled setups; less ideal for consumer UX because markers are intrusive. |
| [`wumbo/Guitar-String-Recognition`](https://github.com/wumbo/Guitar-String-Recognition) | Guitar string extraction from image | Old/simple OpenCV approach; useful as a reference for line/string detection. [Search result](https://github.com/wumbo/Guitar-String-Recognition) |
| [`sagarnildass/Guitar-Detection-YOLO-V8`](https://github.com/sagarnildass/Guitar-Detection-YOLO-V8) | Detect guitar object with YOLOv8 | Not enough by itself, but good for **instrument ROI detection** before fine fretboard estimation. [Search result](https://github.com/sagarnildass/Guitar-Detection-YOLO-V8) |

### CV takeaways

- **MediaPipe Hands** is the default backbone.
- The hard unsolved piece is not hand landmarks alone; it is **calibrating those landmarks into fret/string coordinates** under real camera angles, occlusion, and motion blur.
- Marker-based systems (ArUco) are easiest to get working; markerless systems will likely need:
  1. guitar detection/ROI,
  2. neck/fretboard pose estimation,
  3. line detection or learned keypoint model for strings/frets,
  4. temporal smoothing.

---

## 4) Best datasets and papers

### Must-have dataset

| Resource | Why important | Notes |
|---|---|---|
| **GuitarSet** — [`marl/GuitarSet`](https://github.com/marl/GuitarSet), dataset on [Zenodo](https://zenodo.org/records/3371780) | The standard OSS dataset for guitar transcription research | Provides recordings plus **string and fret annotations**, chords, beats, downbeats, style metadata. The ISMIR 2018 paper explicitly highlights time-aligned **string/fret** information and hexaphonic pickup methodology. [Repo extract], [Paper PDF](https://archives.ismir.net/ismir2018/paper/000188.pdf) |

### Important papers / code pairs

| Paper / code | Relevance | Why it matters |
|---|---|---|
| **Basic Pitch** paper — [arXiv:2203.09893](https://arxiv.org/abs/2203.09893), code: [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) | Lightweight polyphonic AMT | Best practical OSS transcription core for MVP. |
| **TapToTab: Video-Based Guitar Tabs Generation using AI and Audio Analysis** — [arXiv:2409.08618](https://arxiv.org/abs/2409.08618), prototype: [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) | Closest research direction to the user’s exact goal | Explicitly targets tabs from **video + audio**. |
| **A Data-Driven Methodology for Considering Feasibility and Pairwise Likelihood in Deep Learning Based Guitar Tablature Transcription Systems** — [arXiv:2204.08094](https://arxiv.org/abs/2204.08094), code: [`guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition) | Playability-aware tab inference | Helps convert raw pitch predictions into guitar-feasible string/fret outputs. |
| **FretNet: Continuous-Valued Pitch Contour Streaming for Polyphonic Guitar Tablature Transcription** — code: [`guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous) | Guitar-specific continuous transcription | Better for expressive pitch contours than coarse note-only outputs. |
| **High Resolution Guitar Transcription via Domain Adaptation** — [arXiv HTML](https://arxiv.org/html/2402.15258v1) | SOTA-ish zero-shot guitar transcription direction | Strong argument that transfer/domain-adaptation pipelines are now viable for guitar even with scarce labeled data. |
| **CNN Transfer Learning for Visual Guitar Chord Classification** — [PDF](https://shawnbzhang.github.io/assets/PDFs/CS_230_Report.pdf) | Visual chord recognition | Good for image-classification framing of left-hand chord shapes. [Search result surfaced it] |
| **Guitar chord recognition based on finger patterns with deep learning** — [ACM DOI](https://dl.acm.org/doi/10.1145/3290420.3290422) | Vision-based finger-pattern recognition | Strongly aligned with the finger/fret CV problem. |
| **Three-Dimensional Vision-Based Recognition of Guitar Chords** — [MIT/Computer Music Journal page](https://direct.mit.edu/comj/article/doi/10.1162/COMJ.a.690/135590/Three-Dimensional-Vision-Based-Recognition-of) | 3D vision for chord recognition | Important prior art if you later consider depth cameras. |

### Research takeaways

- **Audio transcription** is much more mature than **markerless visual fingering verification**.
- The most novel/hard part of the desired app is **synchronizing playable note hypotheses from audio with observed finger placement from video**.
- GuitarSet remains foundational because it provides **string/fret labels**, not just pitch.

---

## 5) Browser / WebRTC / productization options

If Michael wants a **browser-first trainer**, the OSS stack is surprisingly plausible:

### Strong browser-compatible pieces
- **Audio AMT:** [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts)  
- **CV landmarks:** **MediaPipe Web** via the MediaPipe ecosystem ([repo](https://github.com/google-ai-edge/mediapipe))  
- **Learning UI shell:** ideas from [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) and [`1j01/guitar`](https://github.com/1j01/guitar)  
- **Tab rendering:** `alphaTab` is used by [`iamdey/raf`](https://github.com/iamdey/raf)  
- **Realtime streaming architecture:** Guitariz’s backend includes `websocket_chords.py` for real-time chord streaming in a FastAPI setup. [Repo extract]

### What likely works in browser MVP
1. **Mic input** via Web Audio / WebRTC  
2. **Basic Pitch TS** for note events  
3. **MediaPipe Hands** for 21-point hand landmarks  
4. A neck ROI estimator / manual calibration step  
5. Feedback UI:
   - expected chord/notes
   - played notes
   - estimated fretting region
   - confidence score
   - timing/onset feedback

### What likely does *not* work well yet in pure browser MVP
- Fully robust **markerless** fret/string mapping across random camera angles
- Accurate multi-note fingering verification during fast chord changes without a custom trained CV model
- Rocksmith-grade latency/accuracy without careful performance engineering

---

## 6) Recommended architecture from the available OSS

## Best practical MVP stack

### Option A — fastest path to working prototype
- **Frontend / UI:** use **Guitariz-like** web stack patterns ([repo](https://github.com/Guitariz/Guitariz))
- **Audio layer:** **Basic Pitch** / **Basic Pitch TS** ([Python](https://github.com/spotify/basic-pitch), [TS](https://github.com/spotify/basic-pitch-ts))
- **Rhythm/onset layer:** **Madmom** ([repo](https://github.com/CPJKU/madmom))
- **CV layer:** **MediaPipe Hands**
- **Fretboard calibration:** start with **ArUco markers** like **Chordially** ([repo](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor))
- **Target content:** chord drills first, then scale exercises, then riffs

**Why:** this is the shortest route to “does the user’s fretting match the expected shape and timing?”

### Option B — best research-quality path
- **Dataset:** GuitarSet ([repo](https://github.com/marl/GuitarSet), [dataset](https://zenodo.org/records/3371780))
- **AMT framework:** **amt-tools** ([repo](https://github.com/cwitkowitz/amt-tools))
- **Playable tab inference:** **guitar-transcription-with-inhibition** + **FretNet** repos  
- **Custom CV model:** train guitar-neck keypoints / string-fret intersections + fingertip contact estimation
- **Fusion:** combine audio-derived candidate notes with visual string/fret contact priors

**Why:** this is the best route to accurate per-note/per-string correctness, but much slower.

---

## 7) What is still missing in open source

The OSS gap is not “can we detect pitch?” or “can we track hands?” Both exist. The gap is this **joined inference problem**:

> **At time t, did the player fret the intended string/fret(s) and sound them correctly?**

That requires all of:
- time-aligned **onset detection**
- **polyphonic note estimation**
- **string/fret disambiguation**
- **camera-space to fretboard-space mapping**
- **occlusion handling**
- **feedback logic** tolerant to human variation

No OSS project I found solves all of that cleanly as a reusable product.

---

## 8) Best building blocks shortlist

If I had to choose only the most relevant components:

### Product shell / UX
- [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz)

### Audio transcription
- [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch)
- [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts)

### Guitar-specific transcription research
- [`cwitkowitz/amt-tools`](https://github.com/cwitkowitz/amt-tools)
- [`cwitkowitz/guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition)
- [`cwitkowitz/guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous)
- [`trimplexx/music-transcription`](https://github.com/trimplexx/music-transcription)

### Vision / hand tracking
- [`google-ai-edge/mediapipe`](https://github.com/google-ai-edge/mediapipe)
- [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor)

### Dataset / evaluation
- [`marl/GuitarSet`](https://github.com/marl/GuitarSet)

### DSP / onset / chord / rhythm
- [`CPJKU/madmom`](https://github.com/CPJKU/madmom)
- [`MTG/essentia`](https://github.com/MTG/essentia)

---

## Bottom line

**Does this already exist as a solid open-source app?**  
**No** — not as a mature, well-maintained OSS app that combines **real-time guitar pedagogy + audio transcription + CV-based fingering verification**.

**What exists instead?**  
A strong set of **near-composable building blocks**:

- **Basic Pitch** for polyphonic note events
- **MediaPipe** for hand landmarks
- **Chordially** for fretboard mapping ideas
- **GuitarSet** for evaluation/training
- **FretNet / inhibition-based guitar transcription** for playable tab inference
- **Guitariz** for a modern web app shell and music-learning UX

That combination is enough to build a compelling MVP, especially if the first version:
1. starts with **chord drills / slow exercises**,  
2. uses **marker-based calibration** or constrained camera setup, and  
3. uses audio primarily to confirm **what sounded**, with vision confirming **how it was fingered**.

---

## Concise task summary

### What I did
- Searched GitHub and the web for open-source guitar training, transcription, chord detection, tab following, fretboard detection, MediaPipe, YOLO/OpenCV guitar CV, Rocksmith-like apps, and browser-first/web prototypes.
- Extracted and compared the most relevant repos, datasets, and papers.

### What I found
- No mature OSS app fully matches the target product.
- Closest end-to-end prototypes:  
  - **Chordially** (vision-only tutor)  
  - **Learning Guitar with Deep Learning** (audio+vision research prototype)  
  - **TappyTabs / TapToTab** (video+audio tab generation prototype)  
  - **Guitariz** (best product shell, audio-focused)  
  - **Tuitar** (real-time note/fretboard trainer, no CV)
- Best building blocks: **Basic Pitch**, **MediaPipe**, **GuitarSet**, **amt-tools / FretNet / inhibition**, **Madmom**, **Essentia**.

### Files created or modified
- **None**. This environment exposed web research tools but no local file-write tool in this task.

### Issues encountered
- GitHub page extraction often hid **star counts/watchers/forks**, so I reported **stars/activity only where the tool exposed them** and otherwise used **commit count / releases / prototype status** as maturity signals.
