// MediaPipe Tasks-Vision HandLandmarker (ADR-006). Runs inside the vision
// worker. WASM assets and the .task model are served LOCALLY from /models
// (copied out of node_modules by scripts/copy-vision-assets.mjs) so the app
// works fully offline.
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { Handedness, Landmark, VisionEvent } from "../../fusion/events/visionEvents";

/** Where copy-vision-assets.mjs puts the MediaPipe WASM + the hand model. */
const WASM_PATH = "/models/mediapipe/wasm";
const MODEL_PATH = "/models/hand_landmarker.task";

export type HandDelegate = "GPU" | "CPU";

/** Create a HandLandmarker in VIDEO running mode. Falls back to the CPU delegate
 *  if GPU creation fails (common in workers without a GPU context). */
export async function createHandLandmarker(delegate: HandDelegate): Promise<HandLandmarker> {
  // BUG-002: pick the wasm-loader variant per environment.
  //  - Production/preview build: the bundled worker is a real CLASSIC worker, so
  //    MediaPipe loads the UMD glue (`vision_wasm_internal.js`) via importScripts,
  //    which evals it in global scope and sets `self.ModuleFactory`. useModule=false.
  //  - `vite dev`: the loader's importScripts call throws, so MediaPipe falls back
  //    to a dynamic `import()` of the glue. The UMD glue's `var ModuleFactory`
  //    stays module-scoped under `import()` → "ModuleFactory not set." The ES
  //    module glue (`vision_wasm_module_internal.js`) instead does
  //    `globalThis.ModuleFactory = …; export default …`, which works under
  //    `import()`. useModule=true selects it. (A dev-only Vite middleware serves
  //    that file raw so Vite doesn't reject the /public import — see vite.config.ts.)
  // `import.meta.env.DEV` is statically inlined by Vite, so the production build
  // calls forVisionTasks(WASM_PATH, false) — byte-for-byte the prior behavior.
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH, import.meta.env.DEV);
  const opts = (d: HandDelegate) => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: d },
    runningMode: "VIDEO" as const,
    numHands: 2,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, opts(delegate));
  } catch (err) {
    if (delegate === "GPU") return HandLandmarker.createFromOptions(fileset, opts("CPU"));
    throw err;
  }
}

export interface HandDetection {
  landmarks: Landmark[];
  handed: Handedness;
  conf: number;
}

/** Run detection on one frame and shape the result into per-hand detections.
 *  Landmarks stay in MediaPipe's image-normalized [0..1] space. */
export function toHandDetections(result: HandLandmarkerResult): HandDetection[] {
  const out: HandDetection[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const lms = result.landmarks[i];
    const handedness = result.handednesses[i]?.[0];
    out.push({
      landmarks: lms.map((p) => [p.x, p.y, p.z] as Landmark),
      handed: handedness?.categoryName === "Left" ? "L" : "R",
      conf: handedness?.score ?? 0,
    });
  }
  return out;
}

/** Convenience: a HandDetection → the §9.1 VisionEvent 'hand'. */
export function handEvent(t: number, d: HandDetection): VisionEvent {
  return { t, kind: "hand", landmarks: d.landmarks, handed: d.handed, conf: d.conf };
}
