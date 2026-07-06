# Amp Modeling & Tone Engine Research — How “Guitar In → Amp Sound Out” Works

> **Status:** Research synthesis / product-fit addendum. No application code yet.  
> **Date:** 2026-07-05.  
> **Scope:** Hardware path, real-time DSP architecture, open-source implementation candidates, and how an amp/tone engine coheres with the existing real-time multimodal guitar tutor plan.

## 0. Executive summary

The core idea is technically feasible and fits the existing guitar tutor project, but it should be treated as a **parallel tone/monitoring lane**, not as a replacement for the tutor’s correctness engine.

The product should be **direct-capture-first**:

1. Prefer a clean DI / Hi-Z / audio-interface input whenever available.
2. Analyze the dry/clean signal for accuracy.
3. Generate amp, cabinet, and pedal tone after capture for monitoring.
4. Fall back to the current microphone method when no suitable interface is connected.

The simplest end-to-end path is:

```text
Electric guitar
  → Hi-Z / instrument input on an audio interface
  → ADC + low-latency audio driver
  → real-time software DSP graph
  → amp/pedal model
  → cabinet/mic impulse response
  → output DAC / headphones / monitors
```

The important modeling split:

- **Amp / pedal behavior is nonlinear and level-dependent**: distortion, compression, sag, bias shift, stage loading, and dynamic response cannot be captured by one normal impulse response.
- **Speaker cabinet + mic + room behavior is mostly linear/time-invariant**: it is a strong fit for **impulse response (IR) convolution**.

For this repo, the recommended product direction is:

```text
Tutor fast path:
  mic/interface analysis + webcam vision → fusion → correctness feedback

Tone fast path:
  DI guitar input → amp model → cabinet IR → monitoring output

Shared layer:
  capture device setup, calibration, latency budget, presets, session logs, local-first privacy
```

The amp/tone engine should make the tutor more useful and enjoyable without becoming the hard real-time truth source for whether the user played correctly.

---

## 1. Hardware path: what happens when the guitar plugs into the computer

An electric guitar outputs a weak, high-impedance analog instrument signal. A computer needs digital samples.

```text
Guitar pickups
  → 1/4" instrument cable
  → Hi-Z audio interface input or DI/buffer
  → preamp / gain staging
  → analog-to-digital converter
  → ASIO/CoreAudio/JACK/PipeWire/ALSA driver
  → app audio callback
  → DSP
  → digital-to-analog converter
  → headphones / monitors
```

| Hardware piece | Role | Implementation relevance |
|---|---|---|
| Guitar pickups | Convert string vibration into a high-Z analog signal | Signal level and pickup type affect input gain and model response |
| Hi-Z / instrument input | Accepts passive guitar without loading the pickups too much | Prefer a real audio interface over laptop mic/line input for DI mode |
| DI box / buffer | Converts high-Z to low-Z, useful for splitting/reamping/long cables | Optional but useful for clean capture and repeatable training data |
| Audio interface ADC/DAC | Converts analog↔digital | Noise floor, input headroom, latency, and sample rate matter |
| Low-latency driver | Delivers buffers to the app | ASIO/CoreAudio/JACK are preferred over generic high-latency paths |

Sources:

- Focusrite guide to direct guitar recording / instrument inputs: <https://us.focusrite.com/articles/how-to-record-electric-guitar>
- DI / high-Z to low-Z explanation: <https://theproaudiofiles.com/di-boxes/>

### 1.1 Input-selection policy for this app

The app should default to the cleanest available source, not the easiest source:

| Priority | Input | App behavior |
|---:|---|---|
| 1 | DI / Hi-Z / USB audio interface | Preferred default for electric guitar; use for dry analysis and tone engine input |
| 2 | External USB mic or interface mic | Fallback for acoustic guitar or users without DI; disable browser voice processing where possible |
| 3 | Built-in mic | Last-resort onboarding path; lower expected accuracy |

Browser implementation caveat: `enumerateDevices()` can list audio inputs/outputs, but labels and non-default devices are permission-gated. The app cannot reliably know that a device is a guitar input from the label alone. Therefore the setup flow should combine:

- device enumeration after permission,
- likely-interface label heuristics,
- level/noise/clipping checks,
- a short “play each open string” calibration,
- user override.

Sources:

- MDN `enumerateDevices()`: <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices>
- MDN `AudioWorklet`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet>
- MDN `ConvolverNode`: <https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode>

---

## 2. Latency budget

For amp-like monitoring, the system must feel immediate. The tutor plan already budgets real-time perception tightly; an amp monitoring lane is even more sensitive because the player hears pick attack delay directly.

At 48 kHz, one audio buffer contributes approximately:

| Buffer | One-way buffer time |
|---:|---:|
| 32 samples | 0.67 ms |
| 64 samples | 1.33 ms |
| 128 samples | 2.67 ms |
| 256 samples | 5.33 ms |
| 512 samples | 10.67 ms |

Total round-trip latency is larger than one buffer because it includes:

```text
ADC + input buffer + DSP + output buffer + DAC + driver safety offsets
```

Practical rule:

- **Good target:** <10–12 ms round trip for amp monitoring.
- **Acceptable for tutor analysis:** higher, because visual/audio correctness feedback can tolerate more delay than live monitoring.
- **Architecture rule:** no heap allocation, blocking file loads, locks, network calls, or model downloads inside the audio callback.

Guitarix advertises sub-10 ms processing on a properly configured Linux/JACK system, which is a useful benchmark for the dedicated/desktop path: <https://guitarix.org/>

---

## 3. Typical software amp signal chain

A realistic guitar amp sim is a real-time DSP graph, not one monolithic effect.

```text
Input trim / calibration
  → DC blocker / HPF
  → tuner / noise gate
  → stompbox effects
  → preamp nonlinear stages
  → tone stack EQ
  → power amp / sag / transformer coloration
  → cabinet + microphone simulation
  → post effects
  → output gain / limiter
```

For an MVP, the minimum useful chain is:

```text
Input
  → DC blocker
  → input gain
  → noise gate
  → pre-EQ
  → antialiased distortion / simple preamp
  → tone stack
  → cabinet IR convolution
  → output gain / limiter
```

---

## 4. Modeling approaches

### 4.1 Fast DSP / waveshaping approach

Use filters and nonlinear functions to approximate a guitar amp:

```text
pre-emphasis EQ → nonlinear waveshaper → tone stack → cab IR
```

Common nonlinearities:

- `tanh` soft clipping
- diode-style asymmetric clipping
- polynomial/spline waveshapers
- dynamic compression/sag approximations

Pros:

- Easiest MVP.
- Low CPU.
- Fully controllable knobs.
- Easy to keep license-clean.

Cons:

- Less accurate than captured/circuit models.
- Misses detailed tube-stage interactions unless carefully extended.

### 4.2 White-box circuit / WDF approach

Model the physical amplifier circuit: triodes/tubes, capacitors, resistors, tone stack, transformer, power amp.

Relevant techniques:

- Wave Digital Filters (WDF)
- Modified nodal analysis (MNA)
- nonlinear state-space models
- DK-method and related virtual analog methods
- stage-by-stage nonlinear solvers

Implementation caution: real tube/preamp circuits can require implicit nonlinear solves. Zhang & Smith’s WDF work shows a practical optimization: split cascaded tube preamps into overlapping two-triode blocks to keep nonlinear solves small while preserving adjacent-stage loading.

Sources:

- Real-Time Wave Digital Simulation of Cascaded Vacuum Tube Amplifiers: <https://ccrma.stanford.edu/~jingjiez/publications/Real-Time%20Wave%20Digital%20Simulation%20of%20Cascaded%20Vacuum%20Tube%20Amplifiers%20using%20Modified%20Blockwise%20Method.pdf>
- Physical Audio Signal Processing, Julius O. Smith / CCRMA: <https://ccrma.stanford.edu/~jos/pasp/>

### 4.3 Neural / black-box capture approach

A neural amp model learns the mapping from dry input to real gear output:

```text
known test input → real amp/pedal/rig → recorded output → train model → realtime playback
```

This is the Neural Amp Modeler (NAM) style workflow.

Key details:

- Training uses a known input file, a reamped output file, alignment, and model fitting.
- Sample rate matters; many NAM models are trained at 48 kHz.
- Input level matters because the learned distortion response is level-dependent.
- Amp-head-only captures usually need a cabinet IR after them.
- Full-rig captures may already include cab/mic coloration.

Sources:

- NAM site: <https://www.neuralampmodeler.com/>
- NAM trainer docs: <https://neural-amp-modeler.readthedocs.io/en/latest/tutorials/gui.html>
- NAM Python training/export repo: <https://github.com/sdatkinson/neural-amp-modeler>
- NAM C++ DSP core: <https://github.com/sdatkinson/NeuralAmpModelerCore>
- NAM LV2 implementation notes: <https://github.com/mikeoliphant/neural-amp-modeler-lv2>

---

## 5. Cabinet simulation: impulse responses

Cabinet/mic/room simulation is the highest-realism, lowest-complexity win.

A cabinet IR is a short audio file that captures the response of a cabinet + microphone + room to a test signal. In real-time software, the amp output is convolved with that IR.

Conceptually:

```text
output[n] = sum(input[n-k] * ir[k])
```

Implementation rule:

- Short IRs can use direct convolution.
- Longer cab/room IRs should use **partitioned FFT convolution** to keep latency low.
- The first partition size controls added latency; do not use one giant FFT block for live monitoring.

Sources:

- Tone3000 IR guide: <https://tone3000.com/guides/impulse-responses>
- Farina et al. partitioned convolution paper: <https://www.angelofarina.it/Public/papers/188-Mohonk2003.pdf>

---

## 6. Anti-aliasing and oversampling

Nonlinear distortion creates harmonics. If those harmonics exceed Nyquist, they fold back as aliasing.

Standard mitigation:

```text
upsample → nonlinear block → low-pass → downsample
```

Practical rule:

- Oversample nonlinear stages, not necessarily the whole app.
- 2× or 4× oversampling is common for distortion sections.
- Cabinet IR and post-EQ do not usually need oversampling.
- Neural/circuit models may have their own sample-rate assumptions; handle those explicitly.

---

## 7. Open-source projects and libraries to study

| Project | License posture | What it provides | How to use it here |
|---|---|---|---|
| Guitarix | Mixed BSD/GPL | Mature Linux virtual amp/effects app, JACK, LV2, VST3, NAM/RTNeural support | Reference architecture and UX; be careful with code reuse |
| Neural Amp Modeler Plugin | MIT | `.nam` model playback as plugin/standalone | Strong candidate for permissive neural amp lane |
| NeuralAmpModelerCore | MIT-style ecosystem | C++ NAM DSP core | Candidate backend for `.nam` support |
| RTNeural | BSD-3 | Real-time C++ neural inference | Useful for neural backends and RTNeural/AIDA-style models |
| iPlug2 | permissive zlib-like | Cross-platform audio plugin/app framework | Strong candidate for standalone/VST-style tone engine |
| DPF | ISC | LV2/CLAP/VST/JACK/standalone plugin framework | Strong Linux/open-audio candidate |
| chowdsp_wdf | BSD-3 | WDF circuit modeling primitives | Candidate for circuit-modeled pedals/tone stack |
| Faust | open-source DSP language/toolchain | Fast prototyping for filters/effects | Research/prototype lane |
| AIDA-X | GPL-3+ | AI amp model + cab IR plugin | Architecture reference; avoid direct reuse unless GPL is acceptable |
| BYOD | GPL-3 | Modular distortion/effects plugin | UX/DSP reference; avoid direct reuse unless GPL is acceptable |
| Carla / mod-host | GPL | Plugin hosting/headless LV2 pedalboard architecture | Reference for headless/dedicated hardware rigs |

Primary references:

- Guitarix: <https://github.com/brummer10/guitarix>
- NAM Plugin: <https://github.com/sdatkinson/NeuralAmpModelerPlugin>
- RTNeural: <https://github.com/jatinchowdhury18/RTNeural>
- iPlug2: <https://github.com/iPlug2/iPlug2>
- DPF: <https://github.com/DISTRHO/DPF>
- LV2: <https://lv2plug.in/>
- mod-host: <https://github.com/mod-audio/mod-host>

---

## 8. Licensing posture

The existing tutor plan already has a license firewall. The amp/tone lane should follow the same posture.

### Prefer for shipped code

| License family | Examples |
|---|---|
| MIT | NAM ecosystem pieces |
| BSD-3 | RTNeural, chowdsp_wdf |
| ISC | DPF |
| zlib-like | iPlug2 |
| Apache-2.0 | GuitarML SmartGuitarPedal-style references |

### Treat as reference/offline-only unless we choose a copyleft product license

| License | Examples / caution |
|---|---|
| GPLv2/GPLv3 | Guitarix modules, AIDA-X, BYOD, Carla, mod-host |
| AGPLv3 | JUCE open-source mode / some audio libraries depending on module |
| Non-commercial model licenses | incompatible with broad open-source shipping |

Recommendation: keep the shipped tutor/tone core **MIT/Apache/BSD/ISC-clean** unless there is an explicit project decision to make the whole app GPL.

---

## 9. Cohesion with the existing guitar tutor product

This repo’s existing plan is a **real-time multimodal guitar tutor**: webcam vision + audio analysis → fusion → corrective feedback. Amp modeling does not compete with that; it adds a clean **tone and monitoring layer** around it.

### 9.1 Why the ideas belong together

The tutor asks the user to practice through the app. If the app only gives dry, weak guitar audio, it feels less like playing a real rig. A tone engine makes the practice environment more musical and more motivating.

| Existing tutor capability | Amp/tone engine contribution |
|---|---|
| Mic/interface capture | Adds a DI/instrument-input path for cleaner guitar signal |
| Audio analysis | Can analyze the dry DI before effects while monitoring the wet amp tone |
| Real-time feedback | Lets the player hear an inspiring amp sound while corrections remain deterministic |
| Lessons/presets | Lesson presets can include both target chord/skill and practice tone |
| Session logs | Store tone preset, input level, latency, and audio device metadata with practice sessions |
| Data flywheel | DI + processed audio pairs can support future model/eval datasets |

The key architectural pattern is **split dry analysis from wet monitoring**:

```text
                 ┌─ dry analysis → tuner / notes / chords / fusion
Guitar DI input ─┤
                 └─ wet monitoring → amp model → cab IR → output
```

The dry path is better for correctness. The wet path is better for user experience.

### 9.2 Where it fits in the existing architecture

Add an optional **Tone/Pedal Engine** beside the existing audio-analysis worker:

```text
Audio input
  ├─ Analysis worker
  │    ├─ onset detector
  │    ├─ Basic Pitch / CREPE
  │    └─ chord/template matching
  │
  └─ Tone/pedal engine worker / native audio callback
       ├─ input trim / gate
       ├─ pedal blocks: compressor | overdrive | modulation | delay | reverb | EQ
       ├─ amp backend: simple DSP | NAM | WDF
       ├─ cabinet IR loader
       └─ monitor output
```

The existing fusion engine continues to consume analysis events. It should **not** consume heavily distorted wet audio as its primary truth source because distortion/compression can obscure pitch/onset details.

### 9.3 Product modes

| Mode | Purpose | Uses amp engine? | Uses tutor fusion? |
|---|---|---:|---:|
| **Coach mode** | Learn chords/finger placement with feedback | Optional, low-gain practice tone | Yes |
| **Play mode** | Jam through amp/cab presets | Yes | Optional/meters only |
| **Record/review mode** | Save short clips for slow-path coaching | Optional wet + dry capture | Yes, plus post-session summary |
| **Model/capture mode** | Future NAM-style reamp/capture experiments | Yes, but separate workflow | No, research lane |

### 9.4 Why it should not derail the MVP

The tutor MVP is already hard because the differentiated core is vision+audio fusion. Amp modeling can be built incrementally without blocking that path.

Recommended scope control:

1. **Do not put amp modeling in WP-2’s correctness gate.** WP-2 remains clean audio analysis.
2. Add tone as an optional parallel lane after the capture shell works.
3. Start with simple DSP + cabinet IR only.
4. Add NAM model loading after the analysis/fusion MVP is stable.
5. Keep native/plugin ambitions separate from the browser-first tutor until product value is proven.

---

## 10. Recommended roadmap addition

### Tone-0 — Research/prototype exports

- Build a Python or small C++ offline prototype:
  - load dry guitar WAV
  - apply waveshaper
  - apply tone stack EQ
  - convolve with cab IR
  - export before/after WAVs
- Verify that the simplest amp chain sounds useful.

### Tone-1 — Browser/PWA practice tone

- Add optional Web Audio monitoring chain:
  - input trim
  - gate
  - simple pedal slots: compressor / drive / modulation / delay / reverb / EQ
  - simple antialiased waveshaper
  - tone controls
  - cab IR loader
  - output limiter
- Keep analysis on dry or lightly conditioned signal.

### Tone-1A — Direct-capture setup wizard

- Ask for audio permission, enumerate devices, and prefer likely interface/DI inputs.
- Run a short calibration: level meter, clipping check, noise floor estimate, open-string sanity check.
- Store selected input, input gain, sample rate, and latency estimate with the session.
- If no likely interface is connected, fall back to mic mode and clearly label expected accuracy as lower.

### Tone-2 — Dedicated low-latency path

- If browser latency is not good enough, move amp monitoring to the deferred Tauri/native desktop lane.
- Preserve the same preset schema and session metadata.

### Tone-3 — NAM model loader

- Integrate `.nam` playback through a permissive backend where practical.
- Require sample-rate/model metadata checks.
- Route amp-head models through the existing cab IR loader.

### Tone-4 — Plugin/headless expansion

- Consider iPlug2 or DPF for standalone/plugin targets.
- Keep this as a separate deliverable from the tutor PWA unless the app becomes a general-purpose amp rig.

---

## 11. Implementation recommendation

Start with the current tutor plan intact and add one optional lane:

```text
WP-1 capture shell
  → WP-2 audio analysis remains dry/correctness-focused
  → Tone-1 optional practice tone can be built in parallel
  → WP-4 fusion still uses dry analysis + vision
```

For the first code milestone, build only:

- input gain meter
- clean DI monitoring toggle
- simple distortion amount
- bass/mid/treble tone controls
- cabinet IR loader
- output limiter
- dry/wet routing diagram in debug UI

Do **not** start with:

- a full Neural DSP clone
- real-time training
- a plugin store
- complex multi-amp routing
- GPL code copied into the shipped core

The strongest long-term product shape is:

> **A guitar tutor that can also sound like a real amp while you practice, using dry signal analysis for correctness and wet amp/cab tone for motivation.**

That cohesion is the point: the amp engine makes practice feel good; the tutor engine makes practice effective.
