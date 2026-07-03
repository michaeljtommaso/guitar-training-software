// OpenCV.js calibration (WP-3, ADR-004). This is where the REAL @techstark/
// opencv-js (Apache-2.0) is genuinely loaded and invoked:
//   • cv.getPerspectiveTransform / cv.findHomography — solve the image→fretboard
//     homography from 4 manual-tap corners or from detected ChArUco corners.
//   • cv.aruco_* — ChArUco board detection.
//
// ChArUco IS available in this build under OpenCV 5.x's `aruco_`-prefixed embind
// names (cv.aruco_CharucoDetector / cv.aruco_CharucoBoard / cv.aruco_Dictionary,
// cv.getPredefinedDictionary). charucoAvailable() feature-probes it at runtime.
//
// The per-FRAME fingertip projection does NOT use OpenCV — it uses the pure-TS
// homography (homography.ts) so the hot loop needs no WASM Mat churn. OpenCV
// computes the homography MATRIX once per calibration; the pure-TS side applies
// it every frame. The two solvers are cross-checked in the integration test.
import type { Homography, Point } from "./homography";

// ── Minimal typed facade over the opencv.js embind surface we touch ──────────
// (Avoids `any`; @techstark ships full types but they are unwieldy for the
// dynamic-import + Mat-buffer access pattern.)
interface CvMat {
  delete(): void;
  rows: number;
  cols: number;
  channels(): number;
  total(): number;
  readonly data32F: Float32Array;
  readonly data32S: Int32Array;
  readonly data64F: Float64Array;
}
interface CvMatVector {
  size(): number;
  delete(): void;
}
interface CvCtor<T> {
  new (...args: unknown[]): T;
}
export interface OpenCvModule {
  Mat: CvCtor<CvMat>;
  MatVector: CvCtor<CvMatVector>;
  Size: CvCtor<object>;
  matFromArray(rows: number, cols: number, type: number, arr: number[]): CvMat;
  matFromImageData(imageData: ImageData): CvMat;
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat;
  findHomography(src: CvMat, dst: CvMat, method?: number): CvMat;
  getPredefinedDictionary(id: number): object;
  aruco_CharucoBoard?: CvCtor<{ delete(): void }>;
  aruco_CharucoDetector?: CvCtor<{
    detectBoard(img: CvMat, corners: CvMat, ids: CvMat, markers: CvMatVector, markerIds: CvMat): void;
    delete(): void;
  }>;
  aruco_CharucoParameters?: CvCtor<{ delete(): void }>;
  aruco_DetectorParameters?: CvCtor<{ delete(): void }>;
  aruco_RefineParameters?: CvCtor<{ delete(): void }>;
  CV_32FC2: number;
  CV_64F: number;
  DICT_4X4_50: number;
  onRuntimeInitialized?: () => void;
}

// ── ChArUco board spec (documented per WP-3 deliverable 2) ───────────────────
// A 5×4 chessboard carrying DICT_4X4_50 ArUco markers ⇒ (5−1)×(4−1) = 12
// interior "charuco" corners in a 4-wide × 3-tall grid. squareLength/markerLength
// are in board units and cancel out once we map to normalized fretboard coords.
export const CHARUCO_BOARD = {
  squaresX: 5,
  squaresY: 4,
  squareLength: 0.04,
  markerLength: 0.02,
  dict: "DICT_4X4_50",
  get cornersX() {
    return this.squaresX - 1; // 4
  },
  get cornersY() {
    return this.squaresY - 1; // 3
  },
} as const;

let cvPromise: Promise<OpenCvModule> | null = null;

/** Resolve once opencv's WASM runtime is initialized. @techstark v5's module is
 *  an Emscripten THENABLE that resolves to the ready cv (a different object), so
 *  awaiting it is the correct signal; onRuntimeInitialized / cv.Mat polling do
 *  NOT fire on the original handle. */
export async function waitForOpenCvRuntime(cv: OpenCvModule, timeoutMs = 30_000): Promise<OpenCvModule> {
  const thenable = cv as unknown as { then?: unknown };
  if (typeof thenable.then === "function") {
    cv = (await (cv as unknown as Promise<OpenCvModule>)) ?? cv;
  }
  if (typeof cv.Mat === "function") return cv;
  // Fallback: poll (older/non-thenable builds).
  const started = Date.now();
  return new Promise<OpenCvModule>((resolve, reject) => {
    const poll = () => {
      if (typeof cv.Mat === "function") return resolve(cv);
      if (Date.now() - started > timeoutMs) return reject(new Error("opencv.js runtime init timed out"));
      setTimeout(poll, 10);
    };
    poll();
  });
}

/** Lazy-load and initialize opencv.js exactly once (browser/worker path).
 *  Vite/Rollup wrap the CJS build with a `default`-only namespace, so the
 *  dynamic import resolves cleanly here (unlike vitest's runner — the node
 *  integration test loads opencv via createRequire instead). */
export async function loadOpenCv(): Promise<OpenCvModule> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = (await import("@techstark/opencv-js")) as unknown as { default?: OpenCvModule };
      const cv = (mod.default ?? (mod as unknown as OpenCvModule)) as OpenCvModule;
      return waitForOpenCvRuntime(cv);
    })();
  }
  return cvPromise;
}

/** Runtime feature-probe for the ChArUco pipeline in this opencv build. */
export function charucoAvailable(cv: OpenCvModule): boolean {
  return (
    typeof cv.aruco_CharucoDetector === "function" &&
    typeof cv.aruco_CharucoBoard === "function" &&
    typeof cv.getPredefinedDictionary === "function"
  );
}

function homographyFromMat(m: CvMat): Homography {
  return Array.from(m.data64F); // 3×3 CV_64F, row-major
}

/** Real cv.getPerspectiveTransform from 4 image-space corners to 4
 *  fretboard-space corners. Used by the manual-tap calibration path. */
export function perspectiveTransformCv(cv: OpenCvModule, src: Point[], dst: Point[]): Homography {
  if (src.length !== 4 || dst.length !== 4) throw new Error("need exactly 4 corners");
  const s = cv.matFromArray(4, 1, cv.CV_32FC2, src.flatMap((p) => [p.x, p.y]));
  const d = cv.matFromArray(4, 1, cv.CV_32FC2, dst.flatMap((p) => [p.x, p.y]));
  const m = cv.getPerspectiveTransform(s, d);
  const H = homographyFromMat(m);
  s.delete();
  d.delete();
  m.delete();
  return H;
}

/** Real cv.findHomography from N (≥4) point correspondences. */
export function findHomographyCv(cv: OpenCvModule, src: Point[], dst: Point[]): Homography {
  if (src.length < 4 || src.length !== dst.length) throw new Error("need ≥4 matched points");
  const s = cv.matFromArray(src.length, 1, cv.CV_32FC2, src.flatMap((p) => [p.x, p.y]));
  const d = cv.matFromArray(dst.length, 1, cv.CV_32FC2, dst.flatMap((p) => [p.x, p.y]));
  const m = cv.findHomography(s, d);
  const H = homographyFromMat(m);
  s.delete();
  d.delete();
  m.delete();
  return H;
}

/** Normalized fretboard-space target for detected charuco corner `id`. The
 *  corners form a cornersX×cornersY grid (id = row*cornersX + col), mapped to
 *  the unit square. */
export function charucoCornerTarget(id: number): Point {
  const col = id % CHARUCO_BOARD.cornersX;
  const row = Math.floor(id / CHARUCO_BOARD.cornersX);
  return {
    x: col / (CHARUCO_BOARD.cornersX - 1),
    y: row / (CHARUCO_BOARD.cornersY - 1),
  };
}

export interface CharucoDetection {
  imageCorners: Point[];
  ids: number[];
}

/** Construct the ChArUco board + detector and run detectBoard on an image Mat.
 *  Returns the detected charuco corners (image px) and their ids. Caller owns
 *  `srcMat`. Throws if ChArUco is unavailable in the build. */
export function detectCharuco(cv: OpenCvModule, srcMat: CvMat): CharucoDetection {
  if (!charucoAvailable(cv)) throw new Error("ChArUco not available in this opencv build");
  const Size = cv.Size;
  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_50);
  const board = new cv.aruco_CharucoBoard!(
    new Size(CHARUCO_BOARD.squaresX, CHARUCO_BOARD.squaresY),
    CHARUCO_BOARD.squareLength,
    CHARUCO_BOARD.markerLength,
    dict,
    new cv.Mat(),
  );
  const detector = new cv.aruco_CharucoDetector!(
    board,
    new cv.aruco_CharucoParameters!(),
    new cv.aruco_DetectorParameters!(),
    new cv.aruco_RefineParameters!(10, 3, true),
  );
  const corners = new cv.Mat();
  const ids = new cv.Mat();
  const markers = new cv.MatVector();
  const markerIds = new cv.Mat();
  detector.detectBoard(srcMat, corners, ids, markers, markerIds);

  const out: CharucoDetection = { imageCorners: [], ids: [] };
  const n = corners.total();
  for (let i = 0; i < n; i++) {
    out.imageCorners.push({ x: corners.data32F[i * 2], y: corners.data32F[i * 2 + 1] });
    out.ids.push(ids.data32S[i]);
  }
  corners.delete();
  ids.delete();
  markers.delete();
  markerIds.delete();
  detector.delete();
  board.delete();
  return out;
}

/** Full ChArUco → homography: detect the board, then findHomography from the
 *  detected image corners to their normalized fretboard targets. Confidence is
 *  the fraction of the board's corners that were detected. Returns null if too
 *  few corners for a homography. */
export function charucoHomography(
  cv: OpenCvModule,
  srcMat: CvMat,
): { H: Homography; homographyConf: number; cornersDetected: number } | null {
  const det = detectCharuco(cv, srcMat);
  if (det.imageCorners.length < 4) return null;
  const targets = det.ids.map(charucoCornerTarget);
  const H = findHomographyCv(cv, det.imageCorners, targets);
  const total = CHARUCO_BOARD.cornersX * CHARUCO_BOARD.cornersY;
  return {
    H,
    homographyConf: Math.min(1, det.imageCorners.length / total),
    cornersDetected: det.imageCorners.length,
  };
}
