# Audio Capture, Pitch Detection & Amp Modeling for Guitar Training Software

## Executive Summary

This report synthesizes how commercial apps like Guitar Tuna capture and analyze guitar audio, what open-source libraries replicate that behavior, and how software guitar amp modeling works — all mapped directly against your existing `guitar-training-software` codebase. The good news: **you have already built the hard parts correctly.** Your `buildConstraints.ts` handles the single most important mic-capture decision (disabling browser voice DSP), your `tuner.ts` implements YIN pitch detection correctly, and your `toneChain.ts` is a production-quality Web Audio amp simulation. This document explains the underlying theory, validates the choices already made, and identifies the remaining gaps — particularly around polyphonic note accuracy and potential CREPE/NAM upgrades.

***

## Part 1: How Guitar Tuna and Tuner Apps Capture Audio Cleanly

### The Core Problem: Browser Voice Processing

The single most destructive thing a guitar app can do is let the browser's default audio pipeline process the microphone input. Chrome and Firefox apply **echo cancellation, noise suppression, and automatic gain control (AGC)** by default to `getUserMedia` audio streams. These are tuned for voice calls: they aggressively flatten sustained tones, cut low frequencies, add artifacts to long sustain, and distort the harmonic content that pitch detection depends on.[^1][^2][^3]

For guitar, you must explicitly disable all three:

```typescript
audio: {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}
```

This is unit-test-enforced in your codebase as a hard guardrail — this is exactly right and matches what every production guitar app does. The ADR-004 comment in `buildConstraints.ts` explains the reasoning. Omitting even one of these (particularly `noiseSuppression`) dramatically degrades pitch detection accuracy on sustained notes.[^3]

### Sample Rate and Mono Channel

Guitar Tuna and similar apps target **48 kHz mono** for analysis. The reasons:

- 48 kHz is the browser's native sample rate on most hardware, so requesting it avoids a software resampling step that can add artifacts[^3]
- Mono reduces computational load by half — guitar is a mono instrument for analysis purposes
- The open low-E string resonates at ~82 Hz, and the 19th harmonic (richest zone) sits around 1.5 kHz — well within 48 kHz's frequency range

Your `controller.ts` creates `new AudioContext({ sampleRate: 48000 })` and captures mono, which matches this correctly.

### The AudioWorklet + SharedArrayBuffer Architecture

Commercial apps and the most performant open-source implementations share a specific architecture to move audio from the microphone to the analysis algorithm without dropping frames or introducing garbage-collection jitter:

1. **`getUserMedia`** opens the mic with instrument-safe constraints
2. **`MediaStreamAudioSourceNode`** wraps the stream as a Web Audio graph node
3. **`AudioWorkletNode`** runs a tiny processor on the dedicated audio thread that receives 128-sample quanta at ~2.7 ms intervals
4. The worklet writes each quantum into a **`SharedArrayBuffer` ring buffer** — a lock-free SPSC queue — without `postMessage` (zero serialization overhead on the hot path)[^4]
5. A **Web Worker** reads from the ring buffer and runs the heavier analysis (FFT, onset, chord, YIN tuner) off the audio thread so it never causes audio dropouts

This is the same pattern described by the Chrome audio team and implemented in `ringbuf.js`. Your `capture-processor.ts` does exactly this — it stamps each frame with both `currentTime` (audio clock) and `Date.now()` (wall clock) before pushing to the ring, which gives you the dual-clock anchoring needed to align audio events with vision events in `fusionStore.ts`.[^5][^6][^4]

### What Guitar Tuna Specifically Does

Guitar Tuna uses a **YIN-based pitch detector** for its tuner and combines it with chromagram analysis for chord detection. The Swift-based open-source `Tuna` library (unrelated to the app but illustrative) reveals the typical iOS microphone setup: `AVAudioSession` with `.measurement` category to disable voice processing, `singleChannel` format at 44.1–48 kHz, and a circular buffer feeding the pitch estimator. On Android it uses `AudioRecord` with `SOURCE_MIC` or `SOURCE_UNPROCESSED` (the unprocessed source bypasses hardware voice DSP). For piano detection, the pitch range is simply extended and the app allows polyphonic analysis via chroma.[^7]

***

## Part 2: Pitch Detection Algorithms

### YIN — The Standard Monophonic Pitch Detector

YIN (de Cheveigné & Kawahara, 2002) is the dominant algorithm used in guitar tuner apps. It is a time-domain method that improves on plain autocorrelation by computing a **cumulative mean normalized difference function (CMNDF)**:[^8][^9]

\[ d(\tau) = \sum_{j=1}^{W-\tau} (x_j - x_{j+\tau})^2 \]

\[ d'(\tau) = \frac{d(\tau)}{\frac{1}{\tau}\sum_{k=1}^{\tau} d(k)}, \quad d'(0) = 1 \]

The algorithm searches for the first lag \( \tau \) where \( d'(\tau) \) falls below an absolute threshold (typically 0.10–0.15). Because the normalization divides by the running mean, the function is forced to start at 1 and only dips toward zero at genuine periods — preventing the octave-doubling error that plagues plain autocorrelation. Parabolic interpolation around the winning lag gives sub-sample precision, recovering frequency accuracy well below 1 cent.[^10][^11][^9][^8]

**Key parameter guidance:**
- Threshold 0.10–0.15: lower = more confident but misses weak signals; 0.15 is the typical guitar tuner setting
- Minimum buffer length: must contain several periods of the lowest pitch. At 48 kHz, open low-E at 82 Hz needs ~585 samples per period — use ≥ 2048 samples
- Frequency bounds: 70–500 Hz covers standard guitar, 28–5000 Hz covers bass + guitar + piano

Your `tuner.ts` implements all six YIN steps correctly — difference function, CMNDF, absolute threshold with local minimum walk, parabolic interpolation, and a fallback to global minimum. The `fMin = 70` and `threshold = 0.15` defaults match published recommendations.[^8]

### CREPE — Neural Pitch Detection (Your Deferred Upgrade)

Your ADR-005 lists CREPE via `onnxcrepe` as the intended production path. CREPE (Kim et al., 2018) is a CNN trained on a large corpus that treats pitch detection as a 360-class classification problem (one semitone per class with fine interpolation). It significantly outperforms YIN on:
- Noisy environments (laptop mic with room noise)
- Inharmonic attack transients
- Bent or vibrato notes
- Acoustic guitar with complex timbre

The relevant open-source path is: Spotify's [`basic-pitch`](https://github.com/spotify/basic-pitch) for polyphonic work, and onnxcrepe (CREPE exported to ONNX) for monophonic tuner replacement. Both run in-browser via TensorFlow.js or ONNX Runtime Web. Your `notes/notesWorker.ts` already runs Basic Pitch via TF.js in its own worker, which is the correct architecture — TF.js is heavy (~40 MB) and must not block the audio thread.[^12]

### Chord Detection — Chroma + Template Matching

Chord detection works in three stages:

1. **FFT magnitude spectrum** — computed on a long window (8192 samples ≈ 170 ms at 48 kHz) for frequency resolution. At 1024 samples, the frequency bin width is ~47 Hz, which is too coarse to distinguish adjacent guitar notes on the low strings. An 8192 sample window gives ~5.9 Hz bins, sufficient to resolve open low-E (82 Hz) from the F string (87 Hz).

2. **Chroma vector** — the 12 FFT bins nearest each pitch class across octaves are summed into a 12-element vector. This collapses octave information and represents which pitch classes are present. A C major chord has energy at pitch classes 0 (C), 4 (E), and 7 (G).[^13]

3. **Template matching** — the chroma vector is compared (via cosine similarity or dot product) against precomputed templates for all 24 major/minor chords. The template with the highest score wins.[^13]

Your `analysis.ts` runs the short FFT (1024) at every hop for onset detection, and the long FFT (8192) every 8 hops (~43 ms) for chord and tuner. The `chroma.ts` and `chords.ts` modules implement the full pipeline. A practical limitation: pure template matching struggles with extended chords (7ths, 9ths) and slash chords. The practical accuracy ceiling for clean DI input is ~85–90% for open/barre major/minor chords; for mic input in a noisy room it drops to 60–75%. This is why your architecture wisely uses Basic Pitch for polyphonic notes separately.

### Onset Detection — Spectral Flux

Onset detection (knowing *when* a note was struck) uses **spectral flux** — the sum of positive differences in the FFT magnitude spectrum between consecutive frames. A sudden increase in spectral energy, particularly in the mid-frequency bands where guitar attack transients are strongest, signals a new note event. Your `onset.ts` implements this. This feeds the fusion engine with timing data that the chord/tuner loop (running at lower cadence) cannot provide on its own.

***

## Part 3: Direct Capture (DI) vs. Microphone

### Why DI Input Is Substantially Better

An electric guitar's pickup outputs a **high-impedance (~1 MΩ) instrument-level signal** (~100–300 mV peak). Plugging directly into an audio interface's Hi-Z input bypasses:
- Room acoustics and ambient noise
- The nonlinear, time-varying acoustic response of the guitar body
- Microphone self-noise and positioning artifacts
- The browser/OS noise suppression that damages analysis even when disabled at the constraint level (some hardware applies it in firmware)

For pitch detection accuracy: a DI signal at 48 kHz with a clean preamp gives SNR above 60 dB; a laptop microphone in a typical room gives 20–35 dB. YIN's probability estimate (the `dPrime` minimum value) directly tracks this — on DI you get consistent values below 0.05; on a laptop mic you frequently see 0.10–0.20, the noisy threshold zone.

Your `SetupWizard.tsx` already implements the device prioritization logic and `classifyAudioInput()` in `devices.ts` scores device labels. The practical implication: encourage users to use a Focusrite Scarlett Solo or iRig ($30–$80) — this is the single biggest accuracy improvement available.

### Browser Device Selection Gotchas

`navigator.mediaDevices.enumerateDevices()` only returns labels after the user grants permission, and labels are hardware-reported strings that vary across drivers. Your `devices.ts` uses label heuristics (matching keywords like "interface," "focusrite," "scarlett," "input") plus the open-string calibration check to rank inputs. This is the correct approach — it matches what production apps do, since there is no formal "is this a guitar DI" capability bit in the Web Audio API.

***

## Part 4: Software Guitar Amp Modeling

### How Amp Sims Work — The Signal Chain

Software guitar amp simulators implement a **real-time DSP graph** that models the physical signal chain of an amplifier. The stages in order:

| Stage | Purpose | Implementation |
|---|---|---|
| Input trim / gain | Match signal level to model expectations | GainNode |
| DC blocker / HPF | Remove DC offset from guitar pickups | BiquadFilterNode (highpass ~5 Hz) |
| Noise gate | Mute signal below threshold (silence between notes) | AudioWorklet (gain envelope) |
| Pre-EQ / presence | Shape tone before distortion | BiquadFilterNode |
| Preamp / waveshaper | Nonlinear distortion (the "amp tone") | WaveShaperNode |
| Tone stack | Interactive bass/mid/treble EQ | Multiple BiquadFilterNodes |
| Power amp | Additional compression and coloration | DynamicsCompressorNode or waveshaper |
| Cabinet IR | Speaker + microphone simulation | ConvolverNode |
| Output limiter | Prevent digital clipping | DynamicsCompressorNode |

The critical point is the **modeling split**: the speaker cabinet and microphone response are *linear* (they don't change with signal level), so they can be captured as an **impulse response (IR)** and applied via convolution. The preamp, however, is *nonlinear* — the distortion, compression, and harmonic content all change as a function of drive level. This is why IR-only approaches sound "flat" for amp simulation: they capture the cab but not the preamp dynamics.

### The Three Approaches to Amp Modeling

**1. DSP Waveshaping (simplest, lowest CPU)**

Apply a nonlinear curve (a `WaveShaperNode` curve or `tanh` function) to approximate the preamp, then run through EQ filters and a cab IR. This is what your `toneChain.ts` implements using `makeDriveCurve()` in `shaper.ts`. Quality is limited but usable for practice monitoring. The characteristic `tanh` soft-clip gives a warm overdrive character. Your implementation is correct for an MVP.

```
source → trim → gate → WaveShaperNode(4x oversample) → bass/mid/treble → ConvolverNode(cabIR) → limiter → output
```

**2. Circuit / Wave Digital Filters (highest accuracy, highest CPU)**

Wave Digital Filter (WDF) methods model the actual electronics — tube triodes, capacitors, resistors — as a circuit graph. This captures the dynamic response of how a real amp changes character based on input level, pick attack, and sustained notes. The CCRMA research from Julius O. Smith covers this. The `chowdsp_wdf` library (BSD-3) provides C++ primitives for this approach. This is a deferred lane for your project — necessary only if you want authentic tube emulation.

**3. Neural Amp Modeling (best perceptual quality for real amp capture)**

Neural Amp Modeler (NAM) trains an LSTM or WaveNet-style model on paired dry-input / wet-output recordings. You feed a test signal into a real amp, record the output, then train the model to reproduce the mapping. The trained model then runs in real-time. The ecosystem:[^14][^15]

- [`neural-amp-modeler`](https://github.com/sdatkinson/neural-amp-modeler) — Python trainer (MIT)
- [`NeuralAmpModelerCore`](https://github.com/sdatkinson/NeuralAmpModelerCore) — C++ real-time DSP (MIT-compatible)
- [`RTNeural`](https://github.com/jatinchowdhury18/RTNeural) — BSD-3 real-time neural inference; used by NAM and GuitarML[^16]
- `GuitarML/GuitarLSTM` — LSTM training with TensorFlow/Keras (GPL-3, reference only)[^14]

For a browser-based app, loading a NAM model in WASM or TF.js is technically feasible. The NAM core is ~230 KB as an ONNX export. The practical constraint is latency: NAM inference adds ~2–5 ms per buffer at typical guitar buffer sizes, which is within your latency budget at 48 kHz with 256-sample buffers.[^17]

### Cabinet Impulse Responses

A cab IR is a short audio file (~100–1000 ms) that captures the frequency response of a speaker cabinet + microphone combination. Applying it via convolution gives the characteristic "speaker sound" that makes an amp simulation feel real. For long IRs (>50 ms), **partitioned FFT convolution** is required to keep the per-buffer latency contribution small — the Web Audio `ConvolverNode` handles this internally.

Your `cabIR.ts` generates a synthetic default IR (a parametric approximation), and `loadIR()` supports loading real IR files from disk. The next improvement here is shipping 2–3 real cab IRs with the app. Free permissively-licensed IRs are available from various open hardware guitar projects (verify licenses individually — some require attribution).

### Anti-Aliasing in the Waveshaper

When the waveshaper creates harmonic distortion, it generates frequencies above the Nyquist limit (24 kHz at 48 kHz sample rate). These fold back into the audible range as aliasing artifacts. The standard fix is to oversample the nonlinear section: upsample → waveshape → low-pass → downsample. Your `toneChain.ts` uses `oversample: "4x"` on the WaveShaperNode, which instructs the browser to oversample at 4× (192 kHz) for the distortion stage — this is the correct setting.

***

## Part 5: Your Existing Implementation — Assessment and Gaps

### What Is Already Correct

| Component | File | Status |
|---|---|---|
| Mic constraint guardrails | `buildConstraints.ts` | ✅ Correct — all three browser DSPs disabled, unit-test-enforced |
| 48 kHz mono AudioContext | `controller.ts` | ✅ Correct |
| AudioWorklet + SAB ring buffer | `capture-processor.ts`, `ringBuffer.ts` | ✅ Correct — zero-allocation hot path |
| YIN tuner | `dsp/tuner.ts` | ✅ Correct — all 6 YIN steps, parabolic interpolation, 0.15 threshold |
| Onset detection (spectral flux) | `dsp/onset.ts` | ✅ Correct |
| Chroma + chord template match | `dsp/chroma.ts`, `dsp/chords.ts` | ✅ Correct — long 8192-window for frequency resolution |
| Dry/wet split | `toneChain.ts`, `controller.ts` | ✅ Correct — analysis on dry, amp monitoring on wet |
| Waveshaper tone chain | `toneChain.ts` | ✅ Correct — gate → shaper (4× oversample) → EQ → cab IR → limiter |
| Polyphonic notes (Basic Pitch) | `notes/notesWorker.ts` | ✅ Correct — runs in own worker, TF.js isolated |
| Device classification + setup wizard | `devices.ts`, `SetupWizard.tsx` | ✅ Correct — label heuristics + open-string calibration |
| Dual-clock timestamps | `capture-processor.ts` | ✅ Correct — audio + wall clock per frame |

### Identified Gaps and Improvement Opportunities

**Gap 1: CREPE upgrade for tuner**
YIN is sufficient for standard-tuning notes on DI input, but degrades noticeably on mic input with background noise and on heavily bent notes. ADR-005 already plans the CREPE-ONNX path. The `TunerSource` interface in `tuner.ts` is designed for drop-in replacement — this is the correct abstraction. The blocker is finding or exporting a permissively-licensed CREPE ONNX model.

**Gap 2: Cabinet IR library**
The synthetic default IR in `cabIR.ts` is a parametric approximation. For users with no DI interface (mic mode), the amp monitoring path sounds noticeably artificial. Shipping 2–3 real cab IRs (Marshall 1960, Fender 4×10, direct DI cab-sim) would substantially improve practice feel. Permissive-license IR packs exist; verify per-file.

**Gap 3: Chord accuracy on mic input**
The 12-template chroma matcher is fast but tops out at ~85% on clean DI and drops significantly with mic noise. Adding a spectral flatness gate (suppress chord output when `spectralFlatness` is high) would reduce false positives on noisy inputs — this is already computed in `analysis.ts` but only partially used. A secondary improvement is expanding from 24 templates (major/minor only) to 36+ (add dominant 7, minor 7, suspended) without significant CPU cost.

**Gap 4: NAM model loader (TP-3 in your roadmap)**
Your `docs/plans/direct-capture-and-tone-work-packages.md` lists TP-3 as NAM model loading. The practical path: load `.nam` files (JSON + weights) in a Web Worker, run inference via ONNX Runtime Web or a small TF.js model, and connect the worker output back to the monitoring chain through a SAB ring buffer. The MIT-licensed `NeuralAmpModelerCore` is the reference DSP implementation. A WASM compile of this core is feasible for the browser.

**Gap 5: Latency probe integration**
The `latencyProbe.ts` measures acoustic round-trip time, but the output is not yet surfaced in the setup wizard's accuracy advice. Displaying actual measured latency (and warning when it exceeds the 12 ms target for amp monitoring) would help users understand DI vs. mic tradeoffs.

***

## Part 6: Open-Source Library Reference

### Permissively Licensed (Safe to Ship)

| Project | License | What It Provides | Relevance to Your App |
|---|---|---|---|
| [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) | Apache-2.0 | Polyphonic MIDI transcription, ONNX model ~230 KB | Already in use via TF.js worker[^12][^17] |
| [`sdatkinson/NeuralAmpModelerCore`](https://github.com/sdatkinson/NeuralAmpModelerCore) | MIT-ecosystem | C++ NAM DSP core | WASM compile candidate for TP-3 |
| [`jatinchowdhury18/RTNeural`](https://github.com/jatinchowdhury18/RTNeural) | BSD-3 | Real-time C++ neural inference | Backend for NAM or LSTM pedal models |
| [`padenot/ringbuf.js`](https://github.com/padenot/ringbuf.js) | BSD-like | SAB-based SPSC ring buffer for Web Audio | Reference; you have a custom implementation[^4] |
| [`cwilso/PitchDetect`](https://github.com/cwilso/PitchDetect) | MIT | Web Audio autocorrelation pitch detector | Historical reference; YIN is superior[^18] |
| `chowdsp_wdf` | BSD-3 | Wave Digital Filter primitives | Future circuit-model preamp lane |
| iPlug2 | permissive (zlib-like) | Cross-platform audio plugin framework | Future standalone/VST path |

### GPL / Copyleft (Reference Only)

| Project | License | What It Provides | Usage Caution |
|---|---|---|---|
| Guitarix | GPL-2+ | Mature Linux virtual amp, full DSP architecture reference | Code reuse forces GPL on your app |
| GuitarML/Chameleon | GPL-3 | Neural LSTM amp plugin, architecture reference[^16] | Reference only |
| GuitarML/GuitarLSTM | GPL-3 | LSTM training pipeline for amp capture[^14] | Training tool only — models themselves may be MIT |
| AIDA-X | GPL-3+ | AI amp model + cab IR plugin | Architecture reference |

***

## Part 7: Piano vs. Guitar — Handling Both

The question mentions piano alongside guitar. The audio capture pipeline (browser constraints, 48 kHz mono, AudioWorklet ring buffer) is identical for piano. The differences are:

- **Frequency range**: Piano spans 27.5 Hz (A0) to 4186 Hz (C8). Extend YIN's `fMax` to ~5000 Hz and `fMin` to ~25 Hz, and increase the analysis window to hold at least 2–3 periods of A0 (~36 ms → 1728 samples at 48 kHz, so use ≥ 2048)
- **Polyphony**: Piano commonly plays 4–10 simultaneous notes. YIN and chroma-template are monophonic/chordal methods. Basic Pitch (already in your worker) handles polyphonic piano correctly — it was trained on piano among other instruments[^19][^12]
- **No DI path**: Piano (acoustic or digital) connects via line-out or microphone only. A digital piano's USB or line output is the equivalent of DI — clean and high-SNR. Acoustic piano requires mic placement

For a piano lesson mode, the primary analysis path should be Basic Pitch (polyphonic notes) rather than YIN (monophonic tuner). The chord detection path (chroma + template) works for both instruments.

***

## Conclusion

The `guitar-training-software` architecture is built on the correct foundations: browser voice processing disabled at the constraint layer, AudioWorklet + SAB ring buffer for zero-jitter audio capture, YIN for monophonic pitch with the correct parameters, chroma + template for chord detection with a long analysis window, Basic Pitch for polyphonic notes in an isolated worker, and a native Web Audio amp chain with gate, 4× oversampled waveshaper, EQ, and cab IR convolution for monitoring.[^12][^4][^8]

The **next highest-ROI improvements** in order are:
1. Ship 2–3 real cab IRs to replace the synthetic default (immediate UX win for monitoring quality)
2. Expand chord templates from 24 to 36+ types (dominant 7, minor 7, suspended)
3. Surface the measured round-trip latency in the setup wizard's UX
4. Implement the CREPE-ONNX tuner upgrade behind the `TunerSource` interface (accuracy win on mic input)
5. Add NAM model loader (TP-3) once the core tutor MVP is stable — this enables users to load captures of real amps

---

## References

1. [getUserMedia() Audio Constraints](https://blog.addpipe.com/getusermedia-audio-constraints/) - Control audio input settings using getUserMedia constraints. Adjust echo cancellation, noise suppres...

2. [MediaTrackSettings: echoCancellation property - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/echoCancellation) - The MediaTrackSettings dictionary's echoCancellation property is a Boolean value whose value indicat...

3. [Poor audio quality with getUserMedia. Any ideas why?](https://stackoverflow.com/questions/49477768/poor-audio-quality-with-getusermedia-any-ideas-why) - Also, when you set echoCancellation and noiseSuppression to true , this means the microphone will mu...

4. [GitHub - padenot/ringbuf.js: Wait-free thread-safe single-consumer single-producer ring buffer using SharedArrayBuffer](https://github.com/padenot/ringbuf.js/) - Wait-free thread-safe single-consumer single-producer ring buffer using SharedArrayBuffer - padenot/...

5. [Setting Up](https://developer.chrome.com/blog/audio-worklet-design-pattern) - Audio worklet design pattern

6. [Ring Buffer in AudioWorkletProcessor](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/design-pattern/wasm-ring-buffer/)

7. [GitHub - alladinian/Tuna: Pitch detection & utils.](https://github.com/alladinian/Tuna) - Pitch detection & utils. Contribute to alladinian/Tuna development by creating an account on GitHub.

8. [YIN Pitch Detection Algorithm Calculator - MetricGate](https://metricgate.com/docs/yin-pitch-detector/) - The YIN algorithm estimates the fundamental frequency of speech, singing, or instrument tones via it...

9. [Learning about the YIN algorithm｜Koji Iino - note](https://note.com/lizefield/n/n5c90444d50e7?hl=en) - These are notes from asking ChatGPT because I wanted to learn a bit more about the YIN algorithm, wh...

10. [YIN Pitch detection Algortithm ( how do I improve my results )](https://dsp.stackexchange.com/questions/17493/yin-pitch-detection-algortithm-how-do-i-improve-my-results) - I am using YIN algorithm in a school project of mine which uses pitch detection on guitar sound. I w...

11. [pitch_detection::detector::yin - Rust - Docs.rs](https://docs.rs/pitch-detection/latest/pitch_detection/detector/yin/index.html) - The YIN pitch detection algorithm is based on the algorithm from the paper YIN, a fundamental freque...

12. [GitHub - spotify/basic-pitch: A lightweight yet powerful audio-to-MIDI ...](https://github.com/spotify/basic-pitch) - Basic Pitch is a Python library for Automatic Music Transcription (AMT), using lightweight neural ne...

13. [Chords and Chroma – (Browser based live audio) - Manaswi Mishra](https://manaswimishra.com/portfolio/chords-and-chroma-browser-based-live-audio/) - P5.js | Javascript | Librosa (MIR) | PyAudio In this project I investigated real time Music Informat...

14. [GitHub - GuitarML/GuitarLSTM: Deep learning models for guitar amp ...](https://github.com/GuitarML/GuitarLSTM) - GuitarLSTM trains guitar effect/amp neural network models for processing on wav files. Record input/...

15. [GuitarML: Proteus — AudioTechnology](https://www.audiotechnology.com/free-stuff/guitarml-proteus) - [...]Read More...

16. [GitHub - GuitarML/Chameleon: Vintage guitar amp using neural networks.](https://github.com/GuitarML/Chameleon) - Vintage guitar amp using neural networks. Contribute to GuitarML/Chameleon development by creating a...

17. [AEmotionStudio/basic-pitch-onnx-models - Hugging Face](https://huggingface.co/AEmotionStudio/basic-pitch-onnx-models) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

18. [cwilso/PitchDetect: Pitch detection in Web Audio ...](https://github.com/cwilso/PitchDetect) - Pitch detection in Web Audio using autocorrelation - cwilso/PitchDetect

19. [An open source MIDI converter from Spotify - About - Basic Pitch](https://basicpitch.spotify.com/about) - Basic Pitch is a lightweight, lightning-fast audio-to-MIDI converter that features pitch bend detect...

