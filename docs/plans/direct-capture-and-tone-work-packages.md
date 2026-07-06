# Direct Capture & Tone Engine — Implementation Work Packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Ready to execute. Companion to [implementation-work-packages.md](implementation-work-packages.md) (WP-0…WP-7, all built).
> **Date:** 2026-07-06.
> **Sources:** [product-vision-direct-capture-tone.md](../product/product-vision-direct-capture-tone.md) · [amp-modeling-and-tone-engine-research.md](../research/amp-modeling-and-tone-engine-research.md) · ADR-013 in [technology-decision-records.md](../architecture/technology-decision-records.md).

**Goal:** Make the app direct-capture-first (prefer a DI/Hi-Z/USB-interface input, fall back to mic) and add a wet tone/pedal monitoring engine — while the tutor keeps analyzing the dry signal.

**Architecture:** The existing capture graph (`MediaStreamAudioSourceNode → capture-processor worklet → SAB ring → audio worker`) is the dry analysis path and is **not modified**. A new wet chain fans out from the same source node using **native Web Audio nodes only** (GainNode, WaveShaperNode with `oversample:"4x"`, BiquadFilterNode, ConvolverNode, DynamicsCompressorNode) plus one tiny gate worklet. Input preference is heuristics + a live level/open-string check in the setup wizard, never label matching alone (ADR-013).

**Tech stack:** Everything already installed — React 18, Zustand (incl. `persist` middleware), Zod, Dexie, Vitest, Playwright, native Web Audio. **Zero new dependencies.**

## Global constraints

- `echoCancellation` / `noiseSuppression` / `autoGainControl` stay exactly `false` (guardrail test `buildConstraints.test.ts` enforces this).
- The dry path is the truth source. No analysis code may read post-tone-chain audio (ADR-013). The wet chain must tap `source` (the `MediaStreamAudioSourceNode`), never insert itself before the capture worklet.
- No new npm dependencies. No GPL/AGPL/NC code in the shipped bundle (license firewall, WP-0). Bundle budget: 250 KB gz initial (`pnpm bundle-size`).
- Zod is the write gate for anything persisted (§11 house rule); new session fields must be `.optional()` so existing records still validate.
- Zustand for coarse UI state only; per-frame data never flows through React (ADR-002).
- **Reuse the existing WP-2 DSP scaffolding.** Spectral/level math comes from `apps/web/src/perception/audio/dsp/fft.ts` (`rms`, `magnitudeSpectrum`, `MagnitudeSpectrum`, `hann`); test signals come from `apps/web/src/perception/audio/dsp/synth.ts` (`sineWave`, `harmonicNote`, `chordSignal`, `whiteNoise`, `OPEN_CHORD_FREQS`). Never hand-roll an FFT, RMS loop, or sine generator in new code or tests. Note `synth.ts` is **test-only by contract** (its header says it never ships in the app runtime) — shipped code may import from `dsp/fft.ts` but not from `dsp/synth.ts`.
- All commands below run from the repo root. Unit tests: `pnpm --filter web test <name>`. Typecheck: `pnpm --filter web typecheck`. E2E: `pnpm --filter web e2e`.
- Commit after every task with a conventional-commit message.

**Sequence:**

```text
TP-0  Direct-capture-first input policy + setup wizard   (Tone-1A; accuracy lane)
TP-1  Wet tone chain — native Web Audio MVP              (Tone-0 + Tone-1; feel lane)
  └─ TP-2  Lesson tone presets + session tone metadata
TP-3  Pedalboard (Phase-2 tone)                          — gated, re-plan when opened
TP-4  Deferred lanes: NAM models, native/Tauri low-latency, plugin — triggers only
```

TP-0 and TP-1 are independent (both sit on the existing WP-1 capture shell) and can be built in either order or in parallel.

---

## TP-0 — Direct-capture-first input policy + setup wizard (Tone-1A)

Governing ADR: 013. Maps to §2 of the vision doc.

**Verification gate:** classifier + picker unit tests green; input health meter unit tests green; wizard shows a live level meter, classification chip, clip warning, and open-string check when running; interface auto-preferred on first run (unit-proven picker + wired call); device choice persists across reloads; session records carry input metadata (schema unit test); all existing tests/e2e stay green.

**Non-goals:** any tone processing, latency tuning, gain automation (users set gain on their interface — we only *show* level).

### Task 1: Audio-input classifier + preferred-device picker

**Files:**
- Modify: `apps/web/src/capture/devices.ts`
- Create: `apps/web/src/capture/devices.test.ts`

**Interfaces (produced):**
- `type AudioInputKind = "interface" | "mic" | "unknown"`
- `classifyAudioInput(label: string): AudioInputKind`
- `pickPreferredAudioInput(mics: MediaDeviceInfo[]): MediaDeviceInfo | null`

- [ ] **Step 1: Write the failing test** — `apps/web/src/capture/devices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyAudioInput, pickPreferredAudioInput } from "./devices";

const dev = (label: string, deviceId = label): MediaDeviceInfo =>
  ({ deviceId, groupId: "", kind: "audioinput", label, toJSON: () => ({}) }) as MediaDeviceInfo;

describe("classifyAudioInput", () => {
  it("recognizes common interfaces", () => {
    for (const l of [
      "Scarlett 2i2 USB",
      "Analogue 1 + 2 (Focusrite USB Audio)",
      "IN 1-2 (BEHRINGER UMC202HD)",
      "iRig HD 2",
      "Line 6 HX Stomp",
      "Guitar Input (Hi-Z)",
      "Komplete Audio 2",
      "Volt 2",
    ])
      expect(classifyAudioInput(l), l).toBe("interface");
  });
  it("recognizes built-in / voice devices as mic", () => {
    for (const l of [
      "Microphone Array (Realtek(R) Audio)",
      "Built-in Microphone",
      "Headset (AirPods)",
      "Microphone (HD Pro Webcam C920)",
    ])
      expect(classifyAudioInput(l), l).toBe("mic");
  });
  it("returns unknown for empty or unrecognized labels", () => {
    expect(classifyAudioInput("")).toBe("unknown");
    expect(classifyAudioInput("USB Composite Device")).toBe("unknown");
  });
});

describe("pickPreferredAudioInput", () => {
  it("picks the first interface-classified device", () => {
    const mics = [dev("Microphone Array (Realtek(R) Audio)"), dev("Scarlett 2i2 USB"), dev("Volt 2")];
    expect(pickPreferredAudioInput(mics)?.label).toBe("Scarlett 2i2 USB");
  });
  it("returns null when no interface is present", () => {
    expect(pickPreferredAudioInput([dev("Built-in Microphone")])).toBeNull();
    expect(pickPreferredAudioInput([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test devices` → FAIL (`classifyAudioInput` not exported).

- [ ] **Step 3: Implement** — append to `apps/web/src/capture/devices.ts`:

```ts
// ADR-013: label heuristics are a HINT, not truth — permission-gated labels
// can be empty and vendors are inconsistent. The wizard pairs this with the
// live level/open-string check and always lets the user override.
export type AudioInputKind = "interface" | "mic" | "unknown";

const INTERFACE_RE =
  /scarlett|focusrite|clarett|vocaster|behringer|u-?phoria|umc\d|audient|evo ?\d|motu|\brme\b|babyface|fireface|presonus|audiobox|steinberg|\bur\d|komplete audio|apollo|volt ?\d|irig|line ?6|helix|hx stomp|pod go|katana|m-audio|air ?192|ssl ?2|minifuse|tascam|us-\d|zoom [gu]\d|hi-?z|instrument|guitar|audio interface|quad cortex|axe-?fx/i;

const MIC_RE =
  /built-?in|internal|integrated|realtek|conexant|microphone array|webcam|camera|bluetooth|hands-?free|headset|airpods/i;

export function classifyAudioInput(label: string): AudioInputKind {
  if (!label) return "unknown";
  if (INTERFACE_RE.test(label)) return "interface";
  if (MIC_RE.test(label)) return "mic";
  return "unknown";
}

export function pickPreferredAudioInput(mics: MediaDeviceInfo[]): MediaDeviceInfo | null {
  return mics.find((m) => classifyAudioInput(m.label) === "interface") ?? null;
}
```

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test devices` → PASS.
- [ ] **Step 5: Commit** — `git add apps/web/src/capture/devices.ts apps/web/src/capture/devices.test.ts && git commit -m "feat(capture): classify audio inputs, prefer DI/interface devices (ADR-013)"`

### Task 2: Input health meter (level / clip / noise floor) in the audio worker

**Files:**
- Create: `apps/web/src/perception/audio/inputHealth.ts`
- Create: `apps/web/src/perception/audio/inputHealth.test.ts`
- Modify: `apps/web/src/perception/audio/audioWorker.ts` (extend `AudioWorkerStats`, feed meter in `drain()`, emit in `postStats()`)
- Modify: `apps/web/src/perception/perceptionStore.ts` (add `health` to the `audio` slice)
- Modify: `apps/web/src/capture/controller.ts` (pass `msg.health` through in the `audioStats` branch)

**Interfaces:**
- Consumes: worker `drain()` loop's per-frame `scratch: Float32Array` (128 samples).
- Produces: `interface InputHealth { rmsDb: number; peakDb: number; clipped: boolean; noiseFloorDb: number }`, `class InputHealthMeter { push(frame: Float32Array): void; read(): InputHealth }`; `AudioWorkerStats` gains `health: InputHealth`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/perception/audio/inputHealth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InputHealthMeter } from "./inputHealth";
import { sineWave } from "./dsp/synth"; // existing test-signal scaffolding

// One 128-sample worklet quantum of a 1.5 kHz tone (4 full cycles @ 48 kHz).
const frame = (amp: number) => sineWave(1500, 128 / 48000, 48000, amp);

describe("InputHealthMeter", () => {
  it("tracks RMS and peak of a steady tone", () => {
    const m = new InputHealthMeter();
    for (let i = 0; i < 500; i++) m.push(frame(0.5));
    const h = m.read();
    // sine RMS = amp/√2 → 0.354 ≈ -9 dBFS
    expect(h.rmsDb).toBeGreaterThan(-12);
    expect(h.rmsDb).toBeLessThan(-6);
    expect(h.peakDb).toBeGreaterThan(-7);
    expect(h.clipped).toBe(false);
  });
  it("latches clipping until read, then clears", () => {
    const m = new InputHealthMeter();
    m.push(frame(1.0)); // |s| ≥ 0.99 present
    expect(m.read().clipped).toBe(true);
    m.push(frame(0.1));
    expect(m.read().clipped).toBe(false);
  });
  it("noise floor settles near the quiet level and rises only slowly", () => {
    const m = new InputHealthMeter();
    for (let i = 0; i < 2000; i++) m.push(frame(0.001)); // ≈ -63 dBFS quiet bed
    const quiet = m.read().noiseFloorDb;
    expect(quiet).toBeLessThan(-50);
    for (let i = 0; i < 200; i++) m.push(frame(0.5)); // short loud burst
    expect(m.read().noiseFloorDb).toBeLessThan(quiet + 6); // floor barely moves
  });
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test inputHealth` → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/perception/audio/inputHealth.ts`:

```ts
// Input health for the setup wizard (ADR-013): level, decaying peak, clip
// latch, and a slow lower-envelope noise floor. Pure and Node-testable; the
// audio worker feeds it each 128-sample frame and reads it at stats cadence.
// Level math reuses the WP-2 DSP scaffolding (dsp/fft.ts rms).
import { rms } from "./dsp/fft";

export interface InputHealth {
  rmsDb: number;
  peakDb: number;
  clipped: boolean;
  noiseFloorDb: number;
}

const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

export class InputHealthMeter {
  private meanSq = 0; // EMA of per-frame mean-square (~50 ms @ 128-sample frames)
  private peak = 0; // decaying peak
  private clipCount = 0;
  private floorDb = NaN; // lower envelope: follows drops fast, rises very slowly

  push(frame: Float32Array): void {
    let pk = 0;
    for (let i = 0; i < frame.length; i++) {
      const a = Math.abs(frame[i]);
      if (a > pk) pk = a;
      if (a >= 0.99) this.clipCount++;
    }
    const r = rms(frame); // existing helper — don't re-derive
    this.meanSq += 0.05 * (r * r - this.meanSq);
    this.peak = Math.max(pk, this.peak * 0.9995);
    const rDb = db(Math.sqrt(this.meanSq));
    if (!Number.isFinite(this.floorDb)) this.floorDb = rDb;
    else this.floorDb += (rDb < this.floorDb ? 0.2 : 0.0005) * (rDb - this.floorDb);
  }

  read(): InputHealth {
    const h: InputHealth = {
      rmsDb: db(Math.sqrt(this.meanSq)),
      peakDb: db(this.peak),
      clipped: this.clipCount > 0,
      noiseFloorDb: Number.isFinite(this.floorDb) ? this.floorDb : -180,
    };
    this.clipCount = 0; // clip latch clears on read
    return h;
  }
}
```

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test inputHealth` → PASS.

- [ ] **Step 5: Wire the worker.** In `apps/web/src/perception/audio/audioWorker.ts`:
  - Import: `import { InputHealthMeter, type InputHealth } from "./inputHealth";`
  - Add `health: InputHealth;` to `AudioWorkerStats`.
  - Module scope: `const healthMeter = new InputHealthMeter();`
  - In `drain()`, right after `samplesConsumed += FRAME_SAMPLES;`: `healthMeter.push(scratch);`
  - In `postStats()`, add `health: healthMeter.read(),` to the posted object.

- [ ] **Step 6: Surface it.** In `apps/web/src/perception/perceptionStore.ts` add `health?: InputHealth` to the `audio` slice type (import the type from `../perception/audio/inputHealth` adjusting the relative path to the store's location). In `apps/web/src/capture/controller.ts`, in the `audioStats` branch, add `health: msg.health,` to the object passed to `setPerception({ audio: { … } })`.

- [ ] **Step 7: Verify** — `pnpm --filter web typecheck && pnpm --filter web test` → all green.
- [ ] **Step 8: Commit** — `git commit -am "feat(audio): input health meter (level/clip/noise floor) in worker stats"`

### Task 3: Wizard UX — auto-prefer interface, meter, classification chip, open-string check, persistence

**Files:**
- Create: `apps/web/src/capture/InputMeter.tsx`
- Create: `apps/web/src/capture/OpenStringCheck.tsx`
- Modify: `apps/web/src/capture/captureStore.ts` (persist device choice)
- Modify: `apps/web/src/capture/SetupWizard.tsx`
- Modify: `apps/web/src/App.css` (meter styles)

**Interfaces:**
- Consumes: `classifyAudioInput` / `pickPreferredAudioInput` (Task 1), `snap.audio.health` (Task 2), tuner readings from `perceptionStore` (`audioAnalysis.tuning: { name, f0, cents }`).
- Produces: persisted `cameraId`/`micId`; no new exports consumed by later tasks.

- [ ] **Step 1: Persist device selection.** In `apps/web/src/capture/captureStore.ts`, wrap the store with Zustand's built-in `persist` middleware (already installed — no new dep), persisting only the ids:

```ts
import { persist } from "zustand/middleware";
// …
export const useCaptureStore = create<CaptureState>()(
  persist(
    (set) => ({
      /* existing state/actions unchanged */
    }),
    { name: "gt-capture-devices", partialize: (s) => ({ cameraId: s.cameraId, micId: s.micId }) },
  ),
);
```

- [ ] **Step 2: Level meter component** — `apps/web/src/capture/InputMeter.tsx`:

```tsx
// Live input meter (ADR-013 wizard): RMS bar, peak tick, clip light, noise
// floor. Reads the coarse perception snapshot at worker-stats cadence.
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";

const pct = (dbVal: number) => Math.max(0, Math.min(1, (dbVal + 60) / 60)); // -60..0 dBFS → 0..1

export function InputMeter() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const h = snap.audio?.health;
  if (!h) return null;
  const hot = h.clipped;
  const quiet = h.rmsDb < -45;
  const noisy = h.noiseFloorDb > -50;
  return (
    <div className="input-meter">
      <span className="audio-label">Input</span>
      <span className="meter-track">
        <span className="meter-fill" style={{ transform: `scaleX(${pct(h.rmsDb).toFixed(3)})` }} />
        <span className="meter-peak" style={{ left: `${(pct(h.peakDb) * 100).toFixed(1)}%` }} />
      </span>
      <span className={`clip-light ${hot ? "lit" : ""}`}>clip</span>
      <span className="audio-value">
        {h.rmsDb.toFixed(0)} dB · floor {h.noiseFloorDb.toFixed(0)} dB
      </span>
      {hot && <span className="wizard-error">Clipping — lower your interface gain.</span>}
      {!hot && noisy && <span className="wizard-tip">Noisy input — check cable/gain.</span>}
      {!hot && !noisy && quiet && <span className="wizard-tip">Very quiet — raise interface gain and play.</span>}
    </div>
  );
}
```

- [ ] **Step 3: Open-string check** — `apps/web/src/capture/OpenStringCheck.tsx`. Uses the existing tuner readings; a string chip lights once a near-in-tune reading for that open string is seen. (Confirm the exact `tuning.name` octave format against `midiName` in `apps/web/src/perception/audio/dsp/pitch.ts` before hardcoding — expected `E2 A2 D3 G3 B3 E4`.)

```tsx
// "Strum each open string" sanity check (ADR-013): proves signal per string
// on the chosen input. A chip lights when the tuner reports that open string
// within ±50 cents.
import { useRef, useState, useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";

const OPEN_STRINGS = ["E2", "A2", "D3", "G3", "B3", "E4"] as const;

export function OpenStringCheck() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const lastReading = useRef("");
  const t = snap.audioAnalysis?.tuning;
  const key = t ? `${t.name}:${t.f0.toFixed(1)}` : "";
  if (t && key !== lastReading.current) {
    lastReading.current = key;
    if ((OPEN_STRINGS as readonly string[]).includes(t.name) && Math.abs(t.cents) <= 50 && !seen.has(t.name)) {
      setSeen(new Set(seen).add(t.name));
    }
  }
  return (
    <div className="open-string-check">
      <span className="audio-label">Open strings</span>
      {OPEN_STRINGS.map((s) => (
        <span key={s} className={`string-chip ${seen.has(s) ? "seen" : ""}`}>{s}</span>
      ))}
      <span className="audio-value">{seen.size}/6</span>
      <button type="button" onClick={() => setSeen(new Set())}>Reset</button>
    </div>
  );
}
```

- [ ] **Step 4: Wizard integration.** In `apps/web/src/capture/SetupWizard.tsx`:
  - Import `classifyAudioInput, pickPreferredAudioInput` from `./devices`, plus `InputMeter`, `OpenStringCheck`.
  - **Classification chip** next to the microphone picker (derive from the selected device's label; empty selection → classify the default device's label once lists populate):

```tsx
const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
const kind = classifyAudioInput(micLabel);
// in JSX, after the mic <select>:
<span className={`input-kind ${kind}`}>
  {kind === "interface" ? "direct input" : kind === "mic" ? "mic · fallback (lower accuracy)" : "unknown input"}
</span>
{kind === "mic" && (
  <p className="wizard-tip">
    Mic mode: expect reduced note/timing accuracy. A USB audio interface with a Hi-Z/instrument
    input is recommended for reliable feedback.
  </p>
)}
```

  - **Auto-prefer an interface on first run** — inside `start()`, after `setDevices(await listCaptureDevices())`, restart once on a preferred device if the user has never chosen one (guard with a ref so it runs at most once per session):

```tsx
const autoPicked = useRef(false);
// inside start(), after setDevices(...):
if (!autoPicked.current && !audioDeviceId) {
  autoPicked.current = true;
  const preferred = pickPreferredAudioInput((await listCaptureDevices()).mics);
  if (preferred) {
    select({ micId: preferred.deviceId });
    void start(videoDeviceId, preferred.deviceId); // restart on the interface
    return;
  }
}
```

  - Render `{running && <InputMeter />}` and `{running && <OpenStringCheck />}` above `<LessonPanel />`.
  - Add minimal styles to `apps/web/src/App.css` following the existing `.audio-debug` conventions: `.meter-track` (relative, fixed width, track background), `.meter-fill` (scaleX origin-left, status-triad correct color), `.meter-peak` (absolute 2px tick), `.clip-light.lit` (error color), `.string-chip.seen` (correct color), `.input-kind.interface` (correct) / `.input-kind.mic` (warn).

- [ ] **Step 5: Verify** — `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web e2e` → green (the auto-pick restart must not break `capture-smoke.spec.ts` — Chromium's fake device label classifies as `unknown`, so no restart happens in e2e).
- [ ] **Step 6: Commit** — `git commit -am "feat(capture): direct-capture-first wizard — auto-prefer interface, level meter, open-string check"`

### Task 4: Session input metadata

**Files:**
- Modify: `apps/web/src/fusion/sessionLog.ts`
- Modify: `apps/web/src/fusion/sessionLog.test.ts`
- Modify: `apps/web/src/capture/captureStore.ts` (hold `inputMeta`)
- Modify: `apps/web/src/capture/controller.ts` (populate it on start)
- Modify: `apps/web/src/fusion/fusionStore.ts` (attach to the session record)

**Interfaces:**
- Produces: `InputMetaSchema` / `type InputMeta` in `sessionLog.ts`; `SessionRecordSchema` gains `input: InputMetaSchema.optional()`; `captureStore` exports `getInputMeta(): InputMeta | null` and gains `inputMeta` state + `setInputMeta(m: InputMeta | null)` action.

- [ ] **Step 1: Write the failing test** — add to `apps/web/src/fusion/sessionLog.test.ts`:

```ts
it("accepts and persists optional input metadata; old records still validate", async () => {
  const rec = record();
  rec.input = {
    deviceId: "abc",
    label: "Scarlett 2i2 USB",
    kind: "interface",
    sampleRate: 48000,
    baseLatencyMs: 5.3,
    noiseFloorDb: -72,
  };
  const id = await saveSession(db, rec);
  expect((await db.sessions.get(id))!.input?.kind).toBe("interface");
  await expect(saveSession(db, record(2000))).resolves.toBeGreaterThan(0); // no input field — still valid
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test sessionLog` → FAIL (unknown field / type error).

- [ ] **Step 3: Implement schema** — in `apps/web/src/fusion/sessionLog.ts`, above `SessionRecordSchema`:

```ts
// ADR-013: which input produced this session's evidence — needed to interpret
// accuracy (interface vs mic) and for future eval slicing. Optional so records
// written before this field still validate.
export const InputMetaSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
  kind: z.enum(["interface", "mic", "unknown"]),
  sampleRate: z.number(),
  baseLatencyMs: z.number().optional(),
  outputLatencyMs: z.number().optional(),
  noiseFloorDb: z.number().optional(),
});
export type InputMeta = z.infer<typeof InputMetaSchema>;
```

and inside `SessionRecordSchema` add `input: InputMetaSchema.optional(),` after `lessonId`.

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test sessionLog` → PASS.

- [ ] **Step 5: Populate on capture start.** In `captureStore.ts` add `inputMeta: InputMeta | null` (initial `null`), action `setInputMeta(m)`, and a module-level getter `export const getInputMeta = () => useCaptureStore.getState().inputMeta;`. In `controller.ts` (`startCapture`, after the audio graph is up):

```ts
const track = stream.getAudioTracks()[0];
const settings = track?.getSettings() ?? {};
const devices = await listCaptureDevices();
const label = devices.mics.find((m) => m.deviceId === settings.deviceId)?.label ?? track?.label ?? "";
useCaptureStore.getState().setInputMeta({
  deviceId: settings.deviceId ?? "",
  label,
  kind: classifyAudioInput(label),
  sampleRate: audioContext.sampleRate,
  baseLatencyMs: audioContext.baseLatency * 1000,
  outputLatencyMs: (audioContext.outputLatency ?? 0) * 1000,
});
```

(and `setInputMeta(null)` in `stop()`).

- [ ] **Step 6: Attach to the session record.** In `fusionStore.ts` `startLesson()`, add `input: getInputMeta() ?? undefined,` to the `record = { … }` literal (import `getInputMeta` from `../capture/captureStore`). Optionally refresh `record.input.noiseFloorDb` from the perception snapshot in `stopLesson()`.

- [ ] **Step 7: Verify** — `pnpm --filter web typecheck && pnpm --filter web test` → green.
- [ ] **Step 8: Commit** — `git commit -am "feat(session): record input device/kind/latency metadata per session (ADR-013)"`

---

## TP-1 — Wet tone chain: native Web Audio practice amp (Tone-0 + Tone-1)

Governing ADR: 013 (tone feature decision). Maps to §4 MVP tone features and research §11 first milestone: input trim, DI monitor toggle, noise gate, drive, bass/mid/treble/presence, cab IR loader, output limiter + volume, latency readout.

**Design:** the whole chain is native nodes — `trim(Gain) → gate(worklet) → drive(WaveShaper, oversample "4x") → bass(lowshelf 120 Hz) → mid(peaking 650 Hz, Q 0.8) → treble(highshelf 3.2 kHz) → presence(peaking 4.5 kHz, Q 0.7) → cab(Convolver) → limiter(DynamicsCompressor −6 dB/20:1) → volume(Gain) → monitor(Gain) → destination`, with a parallel `dryTap(Gain)` from trim → limiter for the clean-DI monitor mode. Native `oversample: "4x"` covers anti-aliasing (research §6) — no custom oversampler. All spectral verification in this WP's tests runs on the **existing WP-2 DSP scaffolding** (`magnitudeSpectrum` from `dsp/fft.ts`, signals from `dsp/synth.ts`) — no new FFT/analysis code. Tone-0's "does the simplest chain sound useful" is answered by the harmonic-content unit tests plus live listening; no separate offline prototype app (the repo already has all DSP scaffolding).

**Verification gate:** all pure-DSP unit tests green (drive curve symmetry + harmonic generation, IR decay/rolloff/energy, gate open/close behavior); `tone-monitor.spec.ts` proves in real Chromium that monitor **off → silent output**, **amp → non-silent output**, and **analysis events are unaffected by the wet chain** (dry-path integrity, ADR-013); latency readout renders; `pnpm bundle-size` within budget; zero new dependencies.

**Non-goals (this WP):** pedal blocks beyond the gate, reordering UI, NAM/neural models, WDF/circuit modeling, wet recording, preset browser UI beyond a `<select>`, native/Tauri path.

### Task 5: Drive curve (pure DSP + harmonic proof)

**Files:**
- Create: `apps/web/src/tone/shaper.ts`
- Create: `apps/web/src/tone/shaper.test.ts`

**Interfaces (produced):** `makeDriveCurve(amount: number, n?: number): Float32Array` — `amount` 0..1, default length 2049 (odd → exact zero at center, no DC offset).

- [ ] **Step 1: Write the failing test** — `apps/web/src/tone/shaper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDriveCurve } from "./shaper";
import { magnitudeSpectrum } from "../perception/audio/dsp/fft"; // existing WP-2 scaffolding
import { sineWave } from "../perception/audio/dsp/synth";

const applyCurve = (curve: Float32Array, x: number) => {
  const i = Math.round(((x + 1) / 2) * (curve.length - 1));
  return curve[Math.max(0, Math.min(curve.length - 1, i))];
};

describe("makeDriveCurve", () => {
  it("is odd-symmetric, zero-centered, and bounded", () => {
    const c = makeDriveCurve(0.7);
    const n = c.length;
    expect(n % 2).toBe(1);
    expect(c[(n - 1) / 2]).toBe(0);
    expect(Math.abs(c[0] + c[n - 1])).toBeLessThan(1e-6);
    for (let i = 0; i < n; i++) expect(Math.abs(c[i])).toBeLessThanOrEqual(1);
    for (let i = 1; i < n; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]); // monotonic
  });

  it("adds odd harmonics to a sine as drive increases", () => {
    const N = 8192;
    const sr = 48000;
    const f0 = 750; // bin-ish aligned: 750*8192/48000 = 128
    const bin = Math.round((f0 * N) / sr);
    const energyAt3rd = (amount: number) => {
      const curve = makeDriveCurve(amount);
      const buf = sineWave(f0, N / sr, sr, 0.8);
      for (let i = 0; i < N; i++) buf[i] = applyCurve(curve, buf[i]);
      const mag = magnitudeSpectrum(buf); // Hann-windowed |FFT|, N/2+1 bins
      return mag[3 * bin] / (mag[bin] + 1e-12);
    };
    expect(energyAt3rd(0.8)).toBeGreaterThan(10 * energyAt3rd(0));
    expect(energyAt3rd(0.8)).toBeGreaterThan(0.05); // audible 3rd harmonic
  });
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test shaper` → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/tone/shaper.ts`:

```ts
// Drive curve for a native WaveShaperNode: y = tanh(kx)/tanh(k), normalized so
// ±1 maps to ±1. Odd length keeps an exact zero at x=0 (no DC). Anti-aliasing
// is the node's job (oversample: "4x") — research doc §6.
export function makeDriveCurve(amount: number, n = 2049): Float32Array {
  const k = 1 + 24 * Math.min(1, Math.max(0, amount));
  const norm = Math.tanh(k);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}
```

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test shaper` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(tone): tanh drive curve for WaveShaperNode, harmonic-content proven"`

### Task 6: Default cabinet IR (synthetic, deterministic)

**Files:**
- Create: `apps/web/src/tone/cabIR.ts`
- Create: `apps/web/src/tone/cabIR.test.ts`

**Interfaces (produced):** `makeDefaultCabIR(sampleRate: number, durationS?: number): Float32Array` — unit-energy, deterministic (seeded PRNG).

- [ ] **Step 1: Write the failing test** — `apps/web/src/tone/cabIR.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDefaultCabIR } from "./cabIR";
import { magnitudeSpectrum } from "../perception/audio/dsp/fft"; // existing WP-2 scaffolding

describe("makeDefaultCabIR", () => {
  it("is deterministic and unit-energy", () => {
    const a = makeDefaultCabIR(48000);
    const b = makeDefaultCabIR(48000);
    expect(Array.from(a.slice(0, 16))).toEqual(Array.from(b.slice(0, 16)));
    let e = 0;
    for (let i = 0; i < a.length; i++) e += a[i] * a[i];
    expect(e).toBeCloseTo(1, 3);
  });
  it("decays: last quarter holds <5% of first-quarter energy", () => {
    const ir = makeDefaultCabIR(48000);
    const q = Math.floor(ir.length / 4);
    const energy = (s: number, n: number) => {
      let e = 0;
      for (let i = s; i < s + n; i++) e += ir[i] * ir[i];
      return e;
    };
    expect(energy(3 * q, q)).toBeLessThan(0.05 * energy(0, q));
  });
  it("rolls off highs like a cab: 8kHz+ well below 200Hz–1kHz", () => {
    const ir = makeDefaultCabIR(48000);
    const N = 4096;
    const padded = new Float32Array(N);
    padded.set(ir.subarray(0, Math.min(ir.length, N)));
    const mag = magnitudeSpectrum(padded);
    const band = (lo: number, hi: number) => {
      const b0 = Math.floor((lo * N) / 48000);
      const b1 = Math.ceil((hi * N) / 48000);
      let s = 0;
      for (let i = b0; i <= b1; i++) s += mag[i] * mag[i];
      return s / (b1 - b0 + 1);
    };
    expect(band(8000, 16000)).toBeLessThan(0.2 * band(200, 1000));
  });
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test cabIR` → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/tone/cabIR.ts`:

```ts
// ponytail: synthetic default cab IR — a lowpassed, exponentially decaying
// noise burst with a direct spike. Sounds "speaker-ish", is license-clean and
// deterministic. Swap in a real CC0 IR file via the loader when tone matters.
// dsp/synth.ts has a seeded whiteNoise, but synth is test-only by contract
// (never shipped) — this file ships, so it carries its own 5-line xorshift.
export function makeDefaultCabIR(sampleRate: number, durationS = 0.06): Float32Array {
  const n = Math.floor(sampleRate * durationS);
  const ir = new Float32Array(n);
  const fc = 4200; // cab-ish top end
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
  let lp = 0;
  let seed = 0x2f6e2b1 | 0; // xorshift32 — deterministic across runs
  for (let i = 0; i < n; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    lp += a * (noise - lp);
    ir[i] = lp * Math.exp(-i / (sampleRate * 0.012));
  }
  ir[0] = 1; // direct spike preserves pick attack
  let e = 0;
  for (let i = 0; i < n; i++) e += ir[i] * ir[i];
  const g = 1 / Math.sqrt(e);
  for (let i = 0; i < n; i++) ir[i] *= g;
  return ir;
}
```

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test cabIR` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(tone): deterministic synthetic default cab IR (unit-energy, HF rolloff)"`

### Task 7: Noise gate (pure core + worklet shell)

**Files:**
- Create: `apps/web/src/tone/gateCore.ts`
- Create: `apps/web/src/tone/gateCore.test.ts`
- Create: `apps/web/src/tone/gate-processor.ts` (AudioWorkletProcessor — thin shell, mirrors `capture-processor.ts`; the ambient worklet types in `apps/web/src/perception/audio/worklet.d.ts` are global and cover it)

**Interfaces (produced):**
- `interface GateState { env: number; gain: number }`
- `gateCoef(ms: number, sampleRate: number): number`
- `gateStep(s: GateState, x: number, thresholdLin: number, attack: number, release: number, envCoef: number): number`
- Worklet registered as `"gate-processor"`, threshold set via `port.postMessage({ thresholdDb })`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/tone/gateCore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gateCoef, gateStep, type GateState } from "./gateCore";
import { sineWave } from "../perception/audio/dsp/synth"; // existing test-signal scaffolding

const SR = 48000;
const run = (samples: number, amp: number, s: GateState, thLin: number) => {
  const attack = gateCoef(2, SR);
  const release = gateCoef(60, SR);
  const envCoef = gateCoef(5, SR);
  const sig = sineWave(200, samples / SR, SR, amp);
  let last = 0;
  for (let i = 0; i < sig.length; i++) last = gateStep(s, sig[i], thLin, attack, release, envCoef);
  return { last, s };
};

describe("gate", () => {
  it("passes loud signal (gain → 1)", () => {
    const s: GateState = { env: 0, gain: 0 };
    run(4800, 0.5, s, 0.001);
    expect(s.gain).toBeGreaterThan(0.99);
  });
  it("closes on signal below threshold (gain → 0)", () => {
    const s: GateState = { env: 0, gain: 1 };
    run(9600, 0.0001, s, 0.001);
    expect(s.gain).toBeLessThan(0.01);
  });
  it("releases smoothly — no instant cut", () => {
    const s: GateState = { env: 0, gain: 1 };
    run(480, 0.0001, s, 0.001); // 10 ms of quiet
    expect(s.gain).toBeGreaterThan(0.5); // 60 ms release hasn't finished
  });
});
```

- [ ] **Step 2: Run it — must fail** — `pnpm --filter web test gateCore` → FAIL.

- [ ] **Step 3: Implement core** — `apps/web/src/tone/gateCore.ts`:

```ts
// Noise-gate math, pure and Node-testable; gate-processor.ts is a thin shell.
// Envelope follower + smoothed open/close — no native Web Audio gate exists,
// so this is the one piece of custom realtime DSP in the tone chain.
export interface GateState {
  env: number;
  gain: number;
}

/** One-pole smoothing coefficient for a time constant in ms. */
export function gateCoef(ms: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / ((ms / 1000) * sampleRate));
}

export function gateStep(
  s: GateState,
  x: number,
  thresholdLin: number,
  attack: number,
  release: number,
  envCoef: number,
): number {
  s.env += envCoef * (Math.abs(x) - s.env);
  const target = s.env >= thresholdLin ? 1 : 0;
  s.gain += (target > s.gain ? attack : release) * (target - s.gain);
  return x * s.gain;
}
```

- [ ] **Step 4: Run tests — must pass** — `pnpm --filter web test gateCore` → PASS.

- [ ] **Step 5: Worklet shell** — `apps/web/src/tone/gate-processor.ts`:

```ts
// Realtime shell around gateCore (audio thread): mono in → gated mono out.
// Threshold arrives via port message; no allocation on the hot path.
import { gateCoef, gateStep, type GateState } from "./gateCore";

class GateProcessor extends AudioWorkletProcessor {
  private st: GateState = { env: 0, gain: 1 };
  private thresholdLin = Math.pow(10, -60 / 20);
  private readonly attack = gateCoef(2, sampleRate);
  private readonly release = gateCoef(60, sampleRate);
  private readonly envCoef = gateCoef(5, sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const db = (e.data as { thresholdDb?: number }).thresholdDb;
      if (typeof db === "number") this.thresholdLin = Math.pow(10, db / 20);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0]?.[0];
    const out = outputs[0]?.[0];
    if (inp && out)
      for (let i = 0; i < inp.length; i++)
        out[i] = gateStep(this.st, inp[i], this.thresholdLin, this.attack, this.release, this.envCoef);
    return true;
  }
}

registerProcessor("gate-processor", GateProcessor);
```

(If `worklet.d.ts` doesn't declare the `sampleRate` global, add `declare const sampleRate: number;` there.)

- [ ] **Step 6: Verify** — `pnpm --filter web typecheck && pnpm --filter web test` → green.
- [ ] **Step 7: Commit** — `git commit -am "feat(tone): noise gate — pure core + AudioWorklet shell"`

### Task 8: Tone chain graph + params + presets

**Files:**
- Create: `apps/web/src/tone/toneChain.ts`
- Create: `apps/web/src/tone/presets.ts`

**Interfaces (produced):**

```ts
export type MonitorMode = "off" | "dry" | "amp";
export interface ToneParams {
  monitor: MonitorMode;
  trimDb: number;     // -24..24, default 0
  gateDb: number;     // -90..-30, default -60
  drive: number;      // 0..1, default 0.3
  bassDb: number;     // -12..12, default 0
  midDb: number;
  trebleDb: number;
  presenceDb: number;
  volumeDb: number;   // -60..0, default -12
}
export const DEFAULT_TONE: ToneParams;
export interface ToneChainHandles {
  setParams(p: ToneParams): void;
  loadIR(data: ArrayBuffer): Promise<void>; // decodeAudioData → convolver.buffer
  latencyMs(): number;                      // (baseLatency + outputLatency) * 1000
  outputRms(): number;                      // AnalyserNode tap — e2e/debug + meter
  dispose(): void;
}
export function buildToneChain(ctx: AudioContext, source: AudioNode): Promise<ToneChainHandles>;
```

- `TONE_PRESETS: Record<string, ToneParams>` in `presets.ts`.

- [ ] **Step 1: Implement `toneChain.ts`** (browser-only graph code — verified by the Task 10 e2e in real Chromium; the math it consumes is already unit-tested):

```ts
// Wet monitoring chain (ADR-013): all native Web Audio nodes + the gate
// worklet. Fans out from the SAME MediaStreamAudioSourceNode the dry analysis
// taps — the correctness path never sees this graph.
//
//  source → trim ─→ gate → shaper(4x) → bass → mid → treble → presence → cab ─→ limiter → volume → monitor → destination
//                └──────────────────────── dryTap (clean DI mode) ───────────┘
import { makeDriveCurve } from "./shaper";
import { makeDefaultCabIR } from "./cabIR";
import gateProcessorUrl from "./gate-processor.ts?worker&url";

export type MonitorMode = "off" | "dry" | "amp";

export interface ToneParams {
  monitor: MonitorMode;
  trimDb: number;
  gateDb: number;
  drive: number;
  bassDb: number;
  midDb: number;
  trebleDb: number;
  presenceDb: number;
  volumeDb: number;
}

export const DEFAULT_TONE: ToneParams = {
  monitor: "off",
  trimDb: 0,
  gateDb: -60,
  drive: 0.3,
  bassDb: 0,
  midDb: 0,
  trebleDb: 0,
  presenceDb: 0,
  volumeDb: -12,
};

export interface ToneChainHandles {
  setParams(p: ToneParams): void;
  loadIR(data: ArrayBuffer): Promise<void>;
  latencyMs(): number;
  outputRms(): number;
  dispose(): void;
}

const lin = (db: number) => Math.pow(10, db / 20);

export async function buildToneChain(ctx: AudioContext, source: AudioNode): Promise<ToneChainHandles> {
  await ctx.audioWorklet.addModule(gateProcessorUrl);

  const trim = new GainNode(ctx, { gain: 1 });
  const gate = new AudioWorkletNode(ctx, "gate-processor");
  const shaper = new WaveShaperNode(ctx, { curve: makeDriveCurve(DEFAULT_TONE.drive), oversample: "4x" });
  const bass = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 120 });
  const mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 650, Q: 0.8 });
  const treble = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 3200 });
  const presence = new BiquadFilterNode(ctx, { type: "peaking", frequency: 4500, Q: 0.7 });
  const cab = new ConvolverNode(ctx, { disableNormalization: false });
  const irData = makeDefaultCabIR(ctx.sampleRate);
  const irBuf = ctx.createBuffer(1, irData.length, ctx.sampleRate);
  irBuf.copyToChannel(irData, 0);
  cab.buffer = irBuf;
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 3, ratio: 20, attack: 0.002, release: 0.1 });
  const volume = new GainNode(ctx, { gain: lin(DEFAULT_TONE.volumeDb) });
  const monitor = new GainNode(ctx, { gain: 0 }); // monitor defaults OFF
  const wetHead = new GainNode(ctx, { gain: 1 }); // amp-path enable
  const dryTap = new GainNode(ctx, { gain: 0 }); // clean-DI-path enable
  const analyser = new AnalyserNode(ctx, { fftSize: 2048 });
  const analyserBuf = new Float32Array(analyser.fftSize);

  source.connect(trim);
  trim.connect(wetHead);
  wetHead.connect(gate);
  gate.connect(shaper);
  shaper.connect(bass);
  bass.connect(mid);
  mid.connect(treble);
  treble.connect(presence);
  presence.connect(cab);
  cab.connect(limiter);
  trim.connect(dryTap);
  dryTap.connect(limiter);
  limiter.connect(volume);
  volume.connect(monitor);
  monitor.connect(analyser);
  monitor.connect(ctx.destination);

  let lastDrive = DEFAULT_TONE.drive;

  return {
    setParams(p: ToneParams) {
      trim.gain.value = lin(p.trimDb);
      gate.port.postMessage({ thresholdDb: p.gateDb });
      if (p.drive !== lastDrive) {
        lastDrive = p.drive;
        shaper.curve = makeDriveCurve(p.drive); // allocation OK: control-rate, not audio callback
      }
      bass.gain.value = p.bassDb;
      mid.gain.value = p.midDb;
      treble.gain.value = p.trebleDb;
      presence.gain.value = p.presenceDb;
      volume.gain.value = lin(p.volumeDb);
      wetHead.gain.value = p.monitor === "amp" ? 1 : 0;
      dryTap.gain.value = p.monitor === "dry" ? 1 : 0;
      monitor.gain.value = p.monitor === "off" ? 0 : 1;
    },
    async loadIR(data: ArrayBuffer) {
      cab.buffer = await ctx.decodeAudioData(data);
    },
    latencyMs() {
      return (ctx.baseLatency + (ctx.outputLatency ?? 0)) * 1000;
    },
    outputRms() {
      analyser.getFloatTimeDomainData(analyserBuf);
      let sq = 0;
      for (let i = 0; i < analyserBuf.length; i++) sq += analyserBuf[i] * analyserBuf[i];
      return Math.sqrt(sq / analyserBuf.length);
    },
    dispose() {
      source.disconnect(trim);
      monitor.disconnect();
    },
  };
}
```

- [ ] **Step 2: Presets** — `apps/web/src/tone/presets.ts`:

```ts
// Lesson-facing practice tones (vision doc §4 MVP): data, not code.
import { DEFAULT_TONE, type ToneParams } from "./toneChain";

export const TONE_PRESETS: Record<string, ToneParams> = {
  "Clean Chord Practice": { ...DEFAULT_TONE, monitor: "amp", drive: 0.08, trebleDb: 2, gateDb: -70 },
  "Crunch Rhythm": { ...DEFAULT_TONE, monitor: "amp", drive: 0.45, bassDb: 2, midDb: -2, trebleDb: 3, presenceDb: 2 },
  "Lead Sustain": { ...DEFAULT_TONE, monitor: "amp", drive: 0.7, midDb: 3, trebleDb: 1, presenceDb: 3 },
};
```

- [ ] **Step 3: Verify** — `pnpm --filter web typecheck` → green (no unit test here; the graph is exercised end-to-end in Task 10).
- [ ] **Step 4: Commit** — `git commit -am "feat(tone): native Web Audio tone chain (trim/gate/drive/EQ/cab IR/limiter) + presets"`

### Task 9: Controller integration + tone store + TonePanel UI

**Files:**
- Create: `apps/web/src/tone/toneStore.ts`
- Create: `apps/web/src/tone/TonePanel.tsx`
- Modify: `apps/web/src/capture/controller.ts` (build chain, subscribe store, expose `tone` on `CaptureHandles`, debug hook)
- Modify: `apps/web/src/capture/SetupWizard.tsx` (render `TonePanel`, pass handles)
- Modify: `apps/web/src/App.css` (panel styles, reuse `.audio-debug` conventions)

**Interfaces:**
- Consumes: `buildToneChain`, `DEFAULT_TONE`, `ToneParams`, `TONE_PRESETS`, `classifyAudioInput` (mic-feedback guard).
- Produces: `useToneStore` (Zustand): `{ params: ToneParams; preset: string | null; set(patch: Partial<ToneParams>): void; applyPreset(name: string): void }`; module getter `getToneMeta(): { preset: string | null; monitor: MonitorMode }`; `CaptureHandles.tone: ToneChainHandles`; `window.__toneDebug = { outputRms(): number; latencyMs(): number }`.

- [ ] **Step 1: Tone store** — `apps/web/src/tone/toneStore.ts`:

```ts
// Coarse tone-knob state (UI cadence). The controller subscribes and pushes
// params into the running chain; TonePanel and lesson presets write here.
import { create } from "zustand";
import { DEFAULT_TONE, type MonitorMode, type ToneParams } from "./toneChain";
import { TONE_PRESETS } from "./presets";

interface ToneState {
  params: ToneParams;
  preset: string | null;
  set(patch: Partial<ToneParams>): void;
  applyPreset(name: string): void;
}

export const useToneStore = create<ToneState>((set) => ({
  params: DEFAULT_TONE,
  preset: null,
  set: (patch) => set((s) => ({ params: { ...s.params, ...patch }, preset: null })),
  applyPreset: (name) => {
    const p = TONE_PRESETS[name];
    if (p) set({ params: p, preset: name });
  },
}));

export const getToneMeta = (): { preset: string | null; monitor: MonitorMode } => {
  const s = useToneStore.getState();
  return { preset: s.preset, monitor: s.params.monitor };
};
```

- [ ] **Step 2: Controller wiring.** In `startCapture` (after the analysis graph is set up):

```ts
const tone = await buildToneChain(audioContext, source);
tone.setParams(useToneStore.getState().params);
const unsubTone = useToneStore.subscribe((s) => tone.setParams(s.params));
window.__toneDebug = { outputRms: () => tone.outputRms(), latencyMs: () => tone.latencyMs() };
```

Add `tone` to the returned `CaptureHandles` (type: `tone: ToneChainHandles`), call `unsubTone()`, `tone.dispose()`, and `delete window.__toneDebug` in `stop()`. Extend the `declare global` block with `__toneDebug?: { outputRms(): number; latencyMs(): number }`.

- [ ] **Step 3: TonePanel** — `apps/web/src/tone/TonePanel.tsx`. Controls (all native inputs — no slider lib): monitor mode `<select>` (`off` / `dry` — clean DI / `amp`), preset `<select>` over `Object.keys(TONE_PRESETS)`, `<input type="range">` per knob (trim −24..24, gate −90..−30, drive 0..1 step 0.01, bass/mid/treble/presence −12..12, volume −60..0), IR loader `<input type="file" accept=".wav,audio/*">` → `file.arrayBuffer()` → `handles.tone.loadIR(buf)`, and a latency readout `{handles.tone.latencyMs().toFixed(1)} ms output path`. Feedback guard: when the selected input classifies as `mic` and monitor ≠ off, render `<p className="wizard-error">Mic input + speakers can feedback — use headphones.</p>` (warn only, don't block). Props: `{ tone: ToneChainHandles }`; knob state lives in `useToneStore` (each `onChange` calls `set({ … })`; the store subscription pushes to the chain).

- [ ] **Step 4: Mount it.** In `SetupWizard.tsx`, when running and `handlesRef.current` exists: `<TonePanel tone={handlesRef.current.tone} />` below `<OpenStringCheck />`. (Renders only while capture runs — `videoEl` state already gates that region; use the same condition.)

- [ ] **Step 5: Verify** — `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web e2e` → all green (existing e2e must not regress: monitor defaults `off`, so fake-device audio is unchanged). Manual: `pnpm --filter web dev`, plug in a guitar, flip monitor to `amp`, sweep drive/EQ — this is the Tone-0 listening check.
- [ ] **Step 6: Commit** — `git commit -am "feat(tone): tone store, controller wiring, TonePanel UI with presets + IR loader"`

### Task 10: E2E — wet path works, dry path untouched

**Files:**
- Create: `apps/web/e2e/tone-monitor.spec.ts`

**Interfaces:** Consumes `window.__toneDebug` (Task 9), `window.__captureDebug.snapshot()` (existing), the TonePanel monitor `<select>` (give it `aria-label="Monitor"`).

- [ ] **Step 1: Write the spec** (pattern mirrors `audio-loop.spec.ts` — Chromium fake audio device):

```ts
import { expect, test } from "@playwright/test";

// ADR-013 e2e: the wet monitor produces sound only when enabled, and the dry
// analysis path is indifferent to it (dry = truth source).
test("tone monitor gates output and never disturbs analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined && window.__toneDebug !== undefined);

  // Analysis alive before touching tone.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning), { timeout: 20_000 })
    .toBeGreaterThan(0);

  // Monitor off (default) → silent output.
  await expect
    .poll(() => page.evaluate(() => window.__toneDebug!.outputRms()), { timeout: 10_000 })
    .toBeLessThan(1e-4);

  // Amp mode → audible output.
  await page.getByLabel("Monitor").selectOption("amp");
  await expect
    .poll(() => page.evaluate(() => window.__toneDebug!.outputRms()), { timeout: 10_000 })
    .toBeGreaterThan(1e-3);

  // Dry-path integrity: analysis keeps flowing with identical pitch while the
  // wet chain runs at high drive.
  const before = await page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning);
  const f0Before = await page.evaluate(() => window.__captureDebug!.snapshot().audioAnalysis?.tuning?.f0 ?? NaN);
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning), { timeout: 20_000 })
    .toBeGreaterThan(before);
  const f0After = await page.evaluate(() => window.__captureDebug!.snapshot().audioAnalysis?.tuning?.f0 ?? NaN);
  expect(Math.abs(f0After - f0Before)).toBeLessThan(2); // same fake tone, same reading
});
```

- [ ] **Step 2: Run it** — `pnpm --filter web e2e tone-monitor` → PASS (plus the full suite: `pnpm --filter web e2e`).
- [ ] **Step 3: Bundle + license gates** — `pnpm bundle-size && pnpm license-check` → within budget, clean.
- [ ] **Step 4: Commit** — `git commit -am "test(tone): e2e — monitor gating + dry-path integrity"`

---

## TP-2 — Lesson tone presets + session tone metadata

Maps to vision §4 "presets tied to lessons" and research §9.1 "session logs store tone preset".

**Verification gate:** a lesson with `tone_preset` flips the tone store on lesson start (unit test); session records persist `tone` metadata (unit test); lessons without the field behave exactly as before.

### Task 11: `tone_preset` in lessons-as-data

**Files:**
- Modify: `apps/web/src/fusion/lessons.ts` (lesson Zod schema: add `tone_preset: z.string().optional()` at lesson level, matching the existing snake_case field style, e.g. `feedback_priority`)
- Modify: `apps/web/src/fusion/LessonPanel.tsx` (on lesson start, after the existing `startLesson(id)` call: `const lesson = getLesson(id); if (lesson?.tone_preset) useToneStore.getState().applyPreset(lesson.tone_preset);`)
- Modify: `apps/web/src/fusion/lessons.test.ts` (schema accepts/omits the field)
- Modify: one authored lesson file/entry (wherever the 8 open-chord lessons are defined) — give the C-major lesson `tone_preset: "Clean Chord Practice"`.

- [ ] **Step 1: Failing schema test** — a lesson with `tone_preset: "Clean Chord Practice"` parses; a lesson without it parses; `tone_preset: 5` rejects.
- [ ] **Step 2:** `pnpm --filter web test lessons` → FAIL, implement schema field, → PASS.
- [ ] **Step 3: Failing store test** (`apps/web/src/tone/toneStore.test.ts`): `applyPreset("Crunch Rhythm")` sets `params.drive` to `0.45` and `preset` to the name; unknown preset name is a no-op; any manual `set({ drive: 0.5 })` clears `preset` to `null`.
- [ ] **Step 4:** implement (already written in Task 9 — this test locks the behavior), `pnpm --filter web test toneStore` → PASS.
- [ ] **Step 5:** wire `LessonPanel.tsx` as above; `pnpm --filter web typecheck && pnpm --filter web test` → green.
- [ ] **Step 6: Commit** — `git commit -am "feat(lessons): optional tone_preset per lesson applies practice tone on start"`

### Task 12: Session tone metadata

**Files:**
- Modify: `apps/web/src/fusion/sessionLog.ts` — add to `SessionRecordSchema`:

```ts
tone: z
  .object({
    preset: z.string().nullable(),
    monitor: z.enum(["off", "dry", "amp"]),
  })
  .optional(),
```

- Modify: `apps/web/src/fusion/fusionStore.ts` — in `startLesson()`, add `tone: getToneMeta(),` to the record literal (import `getToneMeta` from `../tone/toneStore`).
- Modify: `apps/web/src/fusion/sessionLog.test.ts` — record with `tone: { preset: "Lead Sustain", monitor: "amp" }` round-trips; record without `tone` still validates.

- [ ] **Step 1:** failing test → **Step 2:** implement → `pnpm --filter web test sessionLog` → PASS.
- [ ] **Step 3: Commit** — `git commit -am "feat(session): record tone preset + monitor mode per session"`

---

## TP-3 — Pedalboard (Phase-2 tone) — gated

**Open when:** TP-1 has shipped **and** session logs show real monitor use (`tone.monitor !== "off"` in a meaningful share of sessions). Re-plan into tasks at that point; do not build speculatively.

- **Scope:** pedal blocks as an ordered list of native-node units — compressor (`DynamicsCompressorNode`), delay (`DelayNode` + feedback `GainNode`), reverb (`ConvolverNode` with a longer generated IR), chorus (`DelayNode` with an `OscillatorNode` LFO on `delayTime`), EQ (`BiquadFilterNode` bank) — inserted between `gate` and `shaper` in `toneChain.ts`; reorder via a plain list UI (buttons, no drag lib); preset browser over user-saved `ToneParams` + block configs in Dexie; wet/dry recording option; latency meter already exists (Task 9).
- **Verification gate:** blocks bypass-clean (unity when disabled), reorder audibly changes the chain, presets round-trip through Dexie, dry path still proven untouched by the TP-1 e2e.
- **Non-goals:** WDF/circuit modeling, any GPL effect code, drag-and-drop polish.

## TP-4 — Deferred lanes (triggers only — no code planned)

Per vision §7 scope control and research §9.4 — these are explicitly *not* planned into tasks yet:

| Lane | Trigger to open |
|---|---|
| **NAM / neural amp loading** (research Tone-3) | Analysis/fusion accuracy gates met (≥90% chord — Q-04 CRNN work comes first) **and** users ask for more realistic tone than drive+IR. Permissive backend only (NeuralAmpModelerCore ecosystem, MIT). |
| **Native/Tauri low-latency monitoring** (research Tone-2) | TP-1's latency readout shows round-trip beyond a playable feel (rule of thumb: >25–30 ms measured on reference hardware) **and** users report the browser monitor unusable. Same preset schema and session metadata carry over. |
| **Plugin/standalone build** (research Tone-4) | Only if the product pivots toward a general-purpose amp rig. iPlug2/DPF candidates (permissive). |

## Cross-cutting non-goals (this whole plan)

- No full Neural DSP clone; no real-time model training; no plugin store; no multi-amp routing.
- No GPL/AGPL code (Guitarix, AIDA-X, BYOD are **reference-only**) — the license firewall stays fail-closed.
- The wet signal never becomes a correctness input. Any future feature that wants to analyze processed audio needs a new ADR.
- No gain automation/AGC of our own on the analysis path — show levels, let the user set hardware gain.

## Dependency matrix

| WP | Depends on | Unblocks | Parallel with |
|---|---|---|---|
| TP-0 | existing WP-1 | better analysis input everywhere | TP-1 |
| TP-1 | existing WP-1 | TP-2, TP-3 | TP-0 |
| TP-2 | TP-1 (+ TP-0 Task 4 pattern) | — | — |
| TP-3 | TP-1 + usage evidence | TP-4 plugin lane | — |
| TP-4 | triggers above | — | — |
