// Capture controller: opens camera+mic with the guarded constraints and wires
// the WP-1 topology — video element (rVFC), AudioContext@48k → AudioWorklet →
// SAB ring buffer → audio worker, and the vision worker (OffscreenCanvas +
// ImageBitmap frame pump + WebGPU/WASM capability probe).
import { buildConstraints, type DeviceSelection } from "./buildConstraints";
import { classifyAudioInput, listCaptureDevices } from "./devices";
import { useCaptureStore } from "./captureStore";
import { startVideoFrameLoop } from "./videoFrameLoop";
import { ringBufferByteLength, RING_CAPACITY } from "../perception/audio/ringBuffer";
import type {
  AudioWorkerStats,
  AudioEventsMsg,
  AudioStateMsg,
  NotesChunkMsg,
} from "../perception/audio/audioWorker";
import {
  setPerception,
  setCalibration,
  visionHot,
  recordAudioEvents,
  recordNotes,
  subscribe as subscribePerception,
  getSnapshot as getPerceptionSnapshot,
} from "../perception/perceptionStore";
import { measureRoundTrip } from "../tone/latencyProbe";
import type { NotesEvent } from "../perception/audio/notes/NoteSource";
import type { VisionEvent } from "../fusion/events/visionEvents";
import { fusionIngest } from "../fusion/fusionStore";
import { audioGlassToWorkerHistogram } from "../observability/latencyHistogram";
import { solveHomography, type Point } from "../perception/vision/homography";
import type { HandDetection } from "../perception/vision/handLandmarker";
import captureProcessorUrl from "../perception/audio/capture-processor.ts?worker&url";
// `?worker` (not the `new URL(..., import.meta.url)` pattern) so Vite BUNDLES the
// worker's ESM imports into a self-contained CLASSIC script in dev too — the raw
// `new URL` classic path is served unbundled in dev and dies on `import` (BUG-002).
import VisionWorker from "../perception/vision/visionWorker.ts?worker";
import { buildToneChain, type ToneChainHandles } from "../tone/toneChain";
import { useToneStore } from "../tone/toneStore";

// Manual-tap destination corners in normalized fretboard space, in the order the
// user is asked to tap them: (nut,lowE) (nut,highE) (fret5,highE) (fret5,lowE).
// Convention: x=0 nut → x=1 fret5; y=0 string6(low E) → y=1 string1(high e).
export const MANUAL_TAP_ORDER = [
  { label: "nut · low E (6th)", dst: { x: 0, y: 0 } },
  { label: "nut · high e (1st)", dst: { x: 0, y: 1 } },
  { label: "5th fret · high e (1st)", dst: { x: 1, y: 1 } },
  { label: "5th fret · low E (6th)", dst: { x: 1, y: 0 } },
] as const;

declare global {
  interface Window {
    /** e2e/debug hook — set while capture is running; proves the real
     *  HandLandmarker runs in-browser on a still image. */
    __visionDebug?: {
      ready: Promise<void>;
      status?: string;
      detectImageUrl(url: string): Promise<HandDetection[]>;
    };
    /** e2e/debug hook — set while capture runs; reads the wet monitor path. */
    __toneDebug?: { outputRms(): number; latencyMs(): number };
  }
}

export interface CaptureHandles {
  stream: MediaStream;
  stop(): void;
  /** Manual 4-corner tap calibration (image-normalized taps, MANUAL_TAP_ORDER).
   *  Primary calibration path; uses the pure-TS DLT homography. */
  setManualCalibration(taps: Point[]): void;
  /** ChArUco calibration from the current video frame (real opencv.js). Returns
   *  the number of detected corners, or 0 if no board was found. */
  calibrateCharuco(): Promise<number>;
  /** Drop the current calibration (overlay dims, mapping stops). */
  clearCalibration(): void;
  /** Wet monitoring chain (ADR-013): fans out from source, never analyzed. */
  tone: ToneChainHandles;
  /** Acoustic round-trip probe (clap test): median ms, or null if no signal. */
  measureLatency(): Promise<number | null>;
}

export interface CaptureOptions extends DeviceSelection {
  /** Run Basic Pitch polyphonic notes in a worker (TF.js). Default true. */
  enableNotes?: boolean;
}

export async function startCapture(
  video: HTMLVideoElement,
  sel: CaptureOptions = {},
): Promise<CaptureHandles> {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "SharedArrayBuffer unavailable — the page must be cross-origin isolated (COOP/COEP headers).",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(sel));
  video.srcObject = stream;
  await video.play();

  // --- audio: AudioContext@48k → worklet → SAB ring → worker ---------------
  const audioContext = new AudioContext({ sampleRate: 48000 });
  await audioContext.resume();
  await audioContext.audioWorklet.addModule(captureProcessorUrl);

  // Latency clock bridging happens inside the ring buffer via per-frame
  // dual stamps (audio clock + Date.now()) — see ringBuffer.ts/audioWorker.ts.
  const sab = new SharedArrayBuffer(ringBufferByteLength(RING_CAPACITY));

  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, "capture-processor", {
    processorOptions: { sab },
  });
  source.connect(workletNode);
  workletNode.connect(audioContext.destination); // outputs silence; keeps the graph pulled

  const audioWorker = new Worker(new URL("../perception/audio/audioWorker.ts", import.meta.url), {
    type: "module",
  });
  audioWorker.postMessage({ type: "init", sab, sampleRate: audioContext.sampleRate });

  // --- wet monitoring chain (ADR-013) --------------------------------------
  // Fans out from the SAME source node as the dry analysis path; the tutor
  // never reads this graph. Monitor defaults OFF, so audio is unchanged.
  const tone = await buildToneChain(audioContext, source);
  tone.setParams(useToneStore.getState().params);
  const unsubTone = useToneStore.subscribe((s) => tone.setParams(s.params));
  window.__toneDebug = { outputRms: () => tone.outputRms(), latencyMs: () => tone.latencyMs() };

  // ADR-013: record which input produced this session's evidence (interface vs
  // mic, latency) so accuracy can be interpreted and sliced later.
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings() ?? {};
  const devices = await listCaptureDevices();
  const label = devices.mics.find((m) => m.deviceId === settings.deviceId)?.label ?? track?.label ?? "";
  useCaptureStore.getState().setOpenStringsSeen(0); // fresh per-session count
  useCaptureStore.getState().setInputMeta({
    deviceId: settings.deviceId ?? "",
    label,
    kind: classifyAudioInput(label),
    sampleRate: audioContext.sampleRate,
    baseLatencyMs: audioContext.baseLatency * 1000,
    outputLatencyMs: (audioContext.outputLatency ?? 0) * 1000,
  });

  // Basic Pitch notes run off the hot path in their own worker (TF.js is
  // heavy). Optional and fully contained — a notes failure never disturbs the
  // onset/chord/tuner loop.
  const enableNotes = sel.enableNotes ?? true;
  let notesWorker: Worker | null = null;
  if (enableNotes) {
    notesWorker = new Worker(new URL("../perception/audio/notes/notesWorker.ts", import.meta.url), {
      type: "module",
    });
    notesWorker.postMessage({ type: "init", modelUrl: "/models/basic-pitch/model.json" });
    notesWorker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: "notes"; events: NotesEvent[] } | { type: string };
      if (msg.type === "notes") {
        const events = (msg as { events: NotesEvent[] }).events;
        for (const ev of events) recordNotes(ev);
        fusionIngest(events, "audio"); // WP-4: notes evidence into the fusion engine
      }
    };
  }

  audioWorker.onmessage = (e: MessageEvent) => {
    const msg = e.data as AudioWorkerStats | AudioEventsMsg | AudioStateMsg | NotesChunkMsg;
    if (msg.type === "audioStats") {
      audioGlassToWorkerHistogram.record(msg.latencyMs); // §16 latency readout
      setPerception({
        audio: {
          framesRead: msg.framesRead,
          samplesConsumed: msg.samplesConsumed,
          dropped: msg.dropped,
          latencyMs: msg.latencyMs,
          health: msg.health,
        },
      });
    } else if (msg.type === "audioEvents") {
      recordAudioEvents(msg.events);
      // WP-4: worker→fusion ingest boundary. The (audio,wall) anchor rides along
      // so fusion can bridge the vision leg's clock (see fusionStore.ts).
      fusionIngest(msg.events, "audio", { wallMs: msg.clockWallMs, audioMs: msg.clockAudioMs });
    } else if (msg.type === "audioState") {
      setPerception({ audioAnalysis: msg.state });
    } else if (msg.type === "notesChunk") {
      notesWorker?.postMessage(
        { type: "chunk", samples: msg.samples, sampleRate: msg.sampleRate, startTimeMs: msg.startTimeMs },
        [msg.samples.buffer],
      );
    }
  };

  // --- vision worker topology ----------------------------------------------
  // CLASSIC worker, imported via `?worker` so Vite bundles it. MediaPipe's
  // HandLandmarker loads its wasm runtime (Emscripten glue, NOT an ES module) via
  // importScripts, which only exists in a classic worker — a module worker fails
  // to fetch/`import()` the wasm loader. But the classic `new URL(...,
  // import.meta.url)` pattern is served UNBUNDLED in `vite dev`, so its ESM
  // `import`s throw "Cannot use import statement outside a module" and the worker
  // dies silently (BUG-002). The `?worker` import fixes that: Vite bundles the
  // worker into a self-contained classic script in BOTH dev and build.
  const visionWorker = new VisionWorker();
  // Never let a worker load/runtime failure be silent again (BUG-002 hid because
  // there was no error handler): surface it to the console and the debug hook.
  visionWorker.onerror = (event) => {
    const detail = event.message ?? String(event);
    console.error(`[vision] worker failed to load or crashed: ${detail}`);
    if (window.__visionDebug) window.__visionDebug.status = `worker-error: ${detail}`;
  };
  const offscreen = new OffscreenCanvas(1280, 720);
  visionWorker.postMessage({ type: "init", canvas: offscreen }, [offscreen]);

  let readyResolve: () => void;
  const visionReady = new Promise<void>((r) => (readyResolve = r));
  const pendingDetections = new Map<number, (hands: HandDetection[]) => void>();
  let detectId = 0;

  visionWorker.onmessage = (e: MessageEvent) => {
    const msg = e.data as
      | { type: "capability"; backend: "webgpu" | "wasm" }
      | { type: "visionStats"; framesReceived: number }
      | { type: "visionReady" }
      | { type: "visionError"; message: string }
      | { type: "visionFrame"; events: VisionEvent[]; wallMs: number }
      | { type: "detectResult"; id: number; hands: HandDetection[] };
    if (msg.type === "capability") setPerception({ backend: msg.backend });
    else if (msg.type === "visionStats") setPerception({ visionFrames: msg.framesReceived });
    else if (msg.type === "visionReady") {
      if (window.__visionDebug) window.__visionDebug.status = "ready";
      readyResolve();
    } else if (msg.type === "visionError") {
      console.error(`[vision] HandLandmarker init failed: ${msg.message}`);
      if (window.__visionDebug) window.__visionDebug.status = `error: ${msg.message}`;
      readyResolve(); // don't hang; overlay just won't get hands
    }
    else if (msg.type === "visionFrame") {
      applyVisionFrame(msg.events);
      // WP-4: worker→fusion ingest boundary. wallMs (Date.now() at detection
      // completion) rebases these worker-clock events onto the audio clock.
      fusionIngest(msg.events, "vision", { wallMs: msg.wallMs });
    }
    else if (msg.type === "detectResult") pendingDetections.get(msg.id)?.(msg.hands);
  };

  // Reduce a frame's §9.1 VisionEvents into the overlay hot state. Calibration
  // echoes are ignored here (calibration is set authoritatively on the main
  // thread via setCalibration); every detection frame — including an empty one —
  // refreshes hands + assigns so stale halos never linger.
  function applyVisionFrame(events: VisionEvent[]) {
    if (events.length > 0 && events.every((e) => e.kind === "calib")) return;
    const hands: typeof visionHot.hands = [];
    let assigns: typeof visionHot.assigns = [];
    for (const ev of events) {
      if (ev.kind === "hand") hands.push({ landmarks: ev.landmarks, handed: ev.handed });
      else if (ev.kind === "fingerAssign") assigns = ev.assigns;
      else if (ev.kind === "strum") visionHot.strum = { dir: ev.dir, conf: ev.conf };
    }
    visionHot.hands = hands;
    visionHot.assigns = assigns;
  }

  const detectImage = (bitmap: ImageBitmap): Promise<HandDetection[]> =>
    new Promise((resolve) => {
      const id = ++detectId;
      pendingDetections.set(id, (hands) => {
        pendingDetections.delete(id);
        resolve(hands);
      });
      visionWorker.postMessage({ type: "detectOnce", bitmap, id }, [bitmap]);
    });

  // e2e / debug hook: prove the real model runs on a still image in-browser.
  window.__visionDebug = {
    ready: visionReady,
    status: "pending",
    async detectImageUrl(url: string): Promise<HandDetection[]> {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      return detectImage(bmp);
    },
  };

  // Frame pump: rVFC-aligned ImageBitmaps (topology proof; ROI path is WP-3).
  let pumpBusy = false;
  const pumpLoop = startVideoFrameLoop(video, () => {
    if (pumpBusy || video.readyState < 2) return;
    pumpBusy = true;
    createImageBitmap(video)
      .then((bitmap) => visionWorker.postMessage({ type: "frame", bitmap }, [bitmap]))
      .catch(() => undefined) // frame not decodable yet — skip
      .finally(() => {
        pumpBusy = false;
      });
  });

  function applyCalibration(H: number[], conf: number) {
    setCalibration(H, conf);
    visionWorker.postMessage({ type: "setCalib", H, conf });
  }

  return {
    stream,
    setManualCalibration(taps: Point[]) {
      if (taps.length !== 4) throw new Error("manual calibration needs 4 taps");
      const dst = MANUAL_TAP_ORDER.map((c) => c.dst);
      // Pure-TS DLT (identical to cv.getPerspectiveTransform, cross-checked in
      // opencvCalib.test.ts) — no need to load 13 MB of WASM for a 4-point solve.
      applyCalibration(solveHomography(taps, dst), 1);
    },
    async calibrateCharuco(): Promise<number> {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const off = new OffscreenCanvas(w, h);
      const cctx = off.getContext("2d");
      if (!cctx) return 0;
      cctx.drawImage(video, 0, 0, w, h);
      const imageData = cctx.getImageData(0, 0, w, h);
      const { loadOpenCv, detectCharuco, charucoCornerTarget, findHomographyCv, CHARUCO_BOARD } =
        await import("../perception/vision/opencvCalib");
      const cv = await loadOpenCv();
      const mat = cv.matFromImageData(imageData);
      try {
        const det = detectCharuco(cv, mat);
        if (det.imageCorners.length < 4) return 0;
        // Normalize pixel corners to image space [0..1] so the homography matches
        // MediaPipe's normalized landmark coords.
        const src = det.imageCorners.map((c) => ({ x: c.x / w, y: c.y / h }));
        const targets = det.ids.map(charucoCornerTarget);
        const H = findHomographyCv(cv, src, targets);
        const total = CHARUCO_BOARD.cornersX * CHARUCO_BOARD.cornersY;
        applyCalibration(H, Math.min(1, det.imageCorners.length / total));
        return det.imageCorners.length;
      } finally {
        (mat as unknown as { delete(): void }).delete();
      }
    },
    clearCalibration() {
      setCalibration(null, 0);
      visionWorker.postMessage({ type: "setCalib", H: null, conf: 0 });
    },
    tone,
    measureLatency() {
      // Fire onset callbacks when the perception snapshot reports a new onset
      // time (audio-clock ms — the same clock the probe schedules clicks on).
      const subscribeOnsets = (cb: (tMs: number) => void): (() => void) => {
        let last = getPerceptionSnapshot().lastOnsetT;
        return subscribePerception(() => {
          const t = getPerceptionSnapshot().lastOnsetT;
          if (t !== last && Number.isFinite(t)) {
            last = t;
            cb(t);
          }
        });
      };
      return measureRoundTrip(audioContext, { subscribeOnsets });
    },
    stop() {
      pumpLoop.stop();
      stream.getTracks().forEach((t) => t.stop());
      unsubTone();
      tone.dispose();
      useCaptureStore.getState().setInputMeta(null);
      delete window.__toneDebug;
      source.disconnect();
      workletNode.disconnect();
      void audioContext.close();
      audioWorker.terminate();
      notesWorker?.terminate();
      visionWorker.terminate();
      delete window.__visionDebug;
      video.srcObject = null;
    },
  };
}
