// Vision worker (WP-3). Owns the MediaPipe HandLandmarker and the deterministic
// fingertip→string/fret + strum post-processing. Receives rVFC-aligned
// ImageBitmap frames, emits typed VisionEvents (§9.1) back to the main thread.
//
// Backends: HandLandmarker uses the GPU delegate when the capability probe says
// 'webgpu', else CPU/WASM (createHandLandmarker falls back to CPU on failure).
import { selectBackend, type PerceptionBackend } from "../capabilities";
import type { VisionEvent } from "../../fusion/events/visionEvents";
import type { Homography } from "./homography";
import { createHandLandmarker, handEvent, toHandDetections } from "./handLandmarker";
import { mapFingertips, toAssigns } from "./fingerMapping";
import { classifyStrum, type WristSample } from "./strum";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

type InMsg =
  | { type: "init"; canvas?: OffscreenCanvas }
  | { type: "frame"; bitmap: ImageBitmap }
  | { type: "setCalib"; H: Homography | null; conf: number }
  | { type: "detectOnce"; bitmap: ImageBitmap; id: number };

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let landmarker: HandLandmarker | null = null;
let framesReceived = 0;
let lastTs = 0;

let currentH: Homography | null = null;
let currentCalibConf = 0;
const WRIST_WINDOW_MS = 400;
const wristHistory: WristSample[] = [];

function post(msg: unknown, transfer?: Transferable[]) {
  (postMessage as (m: unknown, t?: Transferable[]) => void)(msg, transfer);
}
/** Post the frame's §9.1 VisionEvents in one message (staleness-safe: an empty
 *  array when no hands are present tells the overlay to clear). Each batch also
 *  carries a Date.now() wall stamp (the one clock every agent shares) taken at
 *  detection completion, so fusion can rebase these worker-clock event times
 *  onto the audio clock without third-origin arithmetic (see fusionStore.ts). */
function emitFrame(events: VisionEvent[]) {
  post({ type: "visionFrame", events, wallMs: Date.now() });
}
/** Monotonic timestamp for MediaPipe VIDEO mode (must strictly increase). */
function nextTs(): number {
  const now = performance.now();
  lastTs = now > lastTs ? now : lastTs + 1;
  return lastTs;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as InMsg;

  if (msg.type === "init") {
    ctx = msg.canvas?.getContext("2d") ?? null;
    let adapter: unknown = null;
    try {
      const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      adapter = gpu ? await gpu.requestAdapter() : null;
    } catch {
      adapter = null;
    }
    const backend: PerceptionBackend = selectBackend(adapter);
    post({ type: "capability", backend });
    try {
      landmarker = await createHandLandmarker(backend === "webgpu" ? "GPU" : "CPU");
      post({ type: "visionReady" });
    } catch (err) {
      post({ type: "visionError", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === "setCalib") {
    currentH = msg.H;
    currentCalibConf = msg.conf;
    emitFrame([{ t: nextTs(), kind: "calib", homographyConf: msg.conf }]);
    return;
  }

  if (msg.type === "detectOnce") {
    // e2e / debug path: run the real model on a still image and return the raw
    // per-hand detections (proves the model runs in-browser).
    const id = msg.id;
    let hands: ReturnType<typeof toHandDetections> = [];
    if (landmarker) hands = toHandDetections(landmarker.detectForVideo(msg.bitmap, nextTs()));
    msg.bitmap.close();
    post({ type: "detectResult", id, hands });
    return;
  }

  if (msg.type === "frame") {
    framesReceived++;
    ctx?.drawImage(msg.bitmap, 0, 0);
    if (landmarker) processFrame(msg.bitmap);
    msg.bitmap.close();
    if (framesReceived === 1 || framesReceived % 60 === 0) {
      post({ type: "visionStats", framesReceived });
    }
    return;
  }
};

function processFrame(bitmap: ImageBitmap) {
  const t = nextTs();
  const hands = toHandDetections(landmarker!.detectForVideo(bitmap, t));
  if (hands.length === 0) {
    emitFrame([]); // no hands → clear the overlay
    return;
  }

  const events: VisionEvent[] = hands.map((h) => handEvent(t, h));

  // Role split: the hand with the most fingertips on the fretboard window is the
  // FRET hand (→ fingerAssign); the other is the STRUM hand (→ wrist velocity).
  let fretHand = hands[0];
  if (currentH) {
    let bestOnWindow = -1;
    for (const h of hands) {
      const readings = mapFingertips(h.landmarks, currentH, { homographyConf: currentCalibConf });
      const onWin = readings.filter((r) => r.onWindow).length;
      if (onWin > bestOnWindow) {
        bestOnWindow = onWin;
        fretHand = h;
      }
    }
    const readings = mapFingertips(fretHand.landmarks, currentH, { homographyConf: currentCalibConf });
    events.push({ t, kind: "fingerAssign", assigns: toAssigns(readings) });
  }

  // Strum hand = the non-fret hand if there are two; else the only hand.
  const strumHand = hands.length > 1 ? hands.find((h) => h !== fretHand)! : hands[0];
  const wristY = strumHand.landmarks[0]?.[1];
  if (wristY !== undefined) {
    wristHistory.push({ t, y: wristY });
    while (wristHistory.length && t - wristHistory[0].t > WRIST_WINDOW_MS) wristHistory.shift();
    const strum = classifyStrum(wristHistory, WRIST_WINDOW_MS);
    events.push({ t, kind: "strum", dir: strum.dir, conf: strum.conf });
  }
  emitFrame(events);
}
