# Product Vision — Direct Capture First + Digital Tone/Pedal Software

> **Status:** Product vision addendum.  
> **Date:** 2026-07-06.  
> **Companion docs:** [amp-modeling-and-tone-engine-research.md](amp-modeling-and-tone-engine-research.md) · [architecture-hypothesis.md](architecture-hypothesis.md) · [mvp-roadmap.md](mvp-roadmap.md)

## 1. Cleaned-up vision

The software is not only a webcam/mic guitar tutor. The stronger vision is:

> **A real-time guitar practice system that defaults to clean direct guitar capture for accuracy, falls back to mic capture when no interface is connected, and includes a built-in digital tone/pedal engine so practice feels like playing through a real rig.**

This has two product goals that reinforce each other:

1. **Accuracy:** use clean DI / Hi-Z / interface capture as the preferred source of truth for tuner, note, chord, onset, timing, and coaching analysis.
2. **Musical feel:** provide amp, cabinet, and pedal-style digital tone processing so the user hears an inspiring guitar sound while practicing.

The result should feel closer to:

```text
Yousician / Rocksmith-style feedback
  +
Neural Amp Modeler / Guitar Rig / pedalboard-style tone
  +
webcam-assisted finger/fret diagnosis
```

But the architecture must keep the analysis and tone paths separate.

---

## 2. Default input policy

The app should prefer inputs in this order:

| Priority | Input mode | Purpose | Notes |
|---:|---|---|---|
| 1 | **Direct interface / DI / Hi-Z input** | Best correctness signal and best tone-engine source | Default when detected or selected |
| 2 | **External USB mic / interface mic** | Fallback for acoustic guitar or users without DI | Disable voice processing where possible |
| 3 | **Built-in laptop/phone mic** | Last-resort onboarding path | Useful for accessibility, lower accuracy |

Default behavior:

1. Ask for microphone permission.
2. Enumerate audio input devices.
3. Prefer likely audio interfaces / USB inputs over built-in microphones.
4. Run an input setup wizard:
   - show level meter,
   - ask user to strum single strings,
   - detect clipping/noise floor,
   - classify the input as likely DI/interface vs mic,
   - let the user override the choice.
5. If no suitable interface/DI input is found, fall back to the current mic-based method.

Important implementation caveat: browsers cannot always know that a device is a guitar interface. Device labels may be hidden until permission is granted, and labels are inconsistent. So the app should use **heuristics + a setup test**, not label matching alone.

Useful browser APIs:

- `navigator.mediaDevices.getUserMedia()` for capture.
- `navigator.mediaDevices.enumerateDevices()` for input/output selection. MDN notes that labels and non-default devices are permission-gated and that default devices are listed first.
- Web Audio `AudioWorklet` for low-latency custom analysis/processing.
- `ConvolverNode` or a custom convolver for IR/cab simulation.

Sources:

- MDN `enumerateDevices()`: <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices>
- MDN `AudioWorklet`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet>
- MDN `ConvolverNode`: <https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode>

---

## 3. Dry analysis path vs wet tone path

The core architecture rule:

> **Dry signal is the truth source. Wet signal is the player experience.**

```text
Guitar input
  ├─ dry analysis path
  │    ├─ tuner
  │    ├─ onset / timing
  │    ├─ pitch / chord detection
  │    ├─ string/muting evidence
  │    └─ fusion with webcam vision
  │
  └─ wet tone path
       ├─ input trim
       ├─ noise gate
       ├─ pedals
       ├─ amp model
       ├─ cab IR
       ├─ delay/reverb/modulation
       └─ headphones / monitors
```

Why this matters:

- Distortion adds harmonics that can confuse pitch/chord analysis.
- Compression changes dynamics and pick attack evidence.
- Reverb/delay smears timing.
- Noise gates can hide quiet notes or muted-string evidence.
- Clean DI gives repeatable input for future capture/reamping/training.

The tutor should analyze the dry or lightly conditioned signal even when the user is listening to the processed amp tone.

---

## 4. Digital tone/pedal software as a real product feature

The tone/pedal engine should be treated as a feature, not just a debug monitor.

### MVP tone features

- Input gain / calibration meter.
- Clean DI monitor toggle.
- Noise gate.
- Simple drive/distortion.
- Bass/mid/treble/presence tone controls.
- Cabinet IR loader.
- Output volume and limiter.
- Presets tied to lessons, e.g. “Clean Chord Practice,” “Crunch Rhythm,” “Lead Sustain.”

### Phase 2 tone features

- Pedal blocks:
  - compressor,
  - overdrive/distortion/fuzz,
  - chorus/phaser/flanger,
  - delay,
  - reverb,
  - EQ.
- Drag/reorder pedalboard UI.
- Wet/dry recording option.
- Preset browser.
- Latency meter.

### Phase 3 tone features

- NAM / neural amp model loading.
- More realistic cabinet IR management.
- WDF/circuit-modeled pedals or amp stages.
- Standalone/plugin/native low-latency build if browser monitoring is insufficient.

---

## 5. How this improves accuracy

Direct capture improves the tutoring system because it removes a large amount of uncontrolled acoustic variation.

| Accuracy problem | Direct capture improvement |
|---|---|
| Room echo and background noise | greatly reduced |
| Laptop/phone mic AGC/compression | avoided when using interface input |
| Speaker/cab/mic coloration | moved out of the analysis path |
| Inconsistent mic placement | less relevant |
| Distorted amp harmonics | not present in dry analysis signal |
| Training/eval repeatability | dry DI can be replayed/reamped consistently |

It does not eliminate every problem. The app still needs gain calibration, clipping detection, sample-rate handling, and confidence scoring. But it converts the system from “infer truth from a messy room recording” into “measure a cleaner source and intentionally create tone after capture.”

---

## 6. Product modes

| Mode | Capture default | Tone engine | Tutor feedback |
|---|---|---|---|
| **Coach mode** | DI/interface if available, else mic | optional low-latency practice tone | full feedback |
| **Play mode** | DI/interface strongly preferred | primary feature | optional meters only |
| **Record/review mode** | record dry + optional wet | optional | post-session feedback |
| **Acoustic fallback mode** | mic | off or light enhancement | audio+vision feedback |
| **Future capture/model mode** | DI/reamp workflow | model target or playback | research/training lane |

---

## 7. Scope control

This vision is realistic, but the project should not try to build everything at once.

Recommended order:

1. **Input setup wizard:** direct interface preferred; mic fallback.
2. **Dry analysis path:** tuner/chord/onset feedback on the cleanest signal available.
3. **Simple tone path:** drive + tone stack + cab IR for practice feel.
4. **Vision fusion:** webcam-assisted finger/fret diagnosis.
5. **Pedalboard UX:** reorderable effects and presets.
6. **NAM/neural models:** load open amp captures.
7. **Native/plugin path:** only if browser latency cannot satisfy the tone feature.

Non-goals for the first implementation:

- No full Neural DSP clone.
- No real-time model training.
- No proprietary model dependency.
- No GPL/AGPL code in the shipped clean-core unless the whole project intentionally changes license posture.
- No wet/distorted signal as the primary correctness source.

---

## 8. One-sentence product definition

> **A direct-capture-first guitar tutor and practice rig: accurate dry-signal coaching with optional digital amp/pedal tone so learning feels like actually playing through a great setup.**
