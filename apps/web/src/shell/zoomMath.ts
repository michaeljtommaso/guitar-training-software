// ZoomPane pure geometry (spec §6). Nothing here touches a canvas or a store —
// the component and the unit tests both call these, so the hybrid crop/re-
// projection math is verifiable without a live video frame.
//
//   • zoomCropRect(H, videoW, videoH, pad): the fretboard quad (its four
//     corners in fretboard space) projected back into IMAGE space via the same
//     inverse homography the dot overlay uses, then reduced to a padded,
//     video-pixel, axis-aligned bbox clamped to the frame. This is the drawImage
//     source rectangle.
//   • toZoomSpace(dot, crop, canvas): the linear map that places a dot given in
//     intrinsic video pixels into the zoom canvas (same scale drawImage applied
//     to the crop). Callers convert a reused overlay dot (which is in overlay-
//     canvas pixels) to video pixels first: X/overlayW * videoW.
//   • lessonTargetToVoicing: a lesson step's fingering → a display Voicing so the
//     schematic FretboardStrip can render the fallback (§6 fallback path).
import { applyHomography, invertHomography, type Homography } from "../perception/vision/homography";
import { MAX_FRET, fretLineX, stringY } from "../perception/vision/fretboard";
import type { FusionTarget } from "../overlay/targetDots";
import type { ExploreTarget } from "../explore/exploreStore";

/** Crop padding as a fraction of the fretboard bbox HEIGHT (spec §6.2). */
export const ZOOM_PAD = 0.12;

/** drawImage source rectangle, in intrinsic video pixels. */
export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** A point in either video-pixel or zoom-canvas space (X,Y match TargetDot). */
export interface ZoomPoint {
  X: number;
  Y: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * The padded, clamped video-pixel crop rect covering the calibrated fretboard.
 *
 * Corners are the fretboard-space quad {(0,1),(1,1),(0,0),(1,0)} = nut→MAX_FRET ×
 * string1→string6 (spec §6.1), pushed through Hinv (fretboard→image) and scaled
 * to intrinsic video pixels. Returns a zero-size crop if H is singular so the
 * caller can fall back rather than crash mid-frame.
 */
export function zoomCropRect(
  H: Homography,
  videoW: number,
  videoH: number,
  pad: number = ZOOM_PAD,
): CropRect {
  let Hinv: Homography;
  try {
    Hinv = invertHomography(H);
  } catch {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const corners = [
    { x: fretLineX(0), y: stringY(1) },
    { x: fretLineX(MAX_FRET), y: stringY(1) },
    { x: fretLineX(0), y: stringY(6) },
    { x: fretLineX(MAX_FRET), y: stringY(6) },
  ].map((c) => applyHomography(Hinv, c));

  const xs = corners.map((c) => c.x * videoW);
  const ys = corners.map((c) => c.y * videoH);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  const padPx = pad * (maxY - minY); // pad by a fraction of the bbox HEIGHT
  minX -= padPx;
  maxX += padPx;
  minY -= padPx;
  maxY += padPx;

  minX = clamp(minX, 0, videoW);
  maxX = clamp(maxX, 0, videoW);
  minY = clamp(minY, 0, videoH);
  maxY = clamp(maxY, 0, videoH);

  return { sx: minX, sy: minY, sw: Math.max(0, maxX - minX), sh: Math.max(0, maxY - minY) };
}

/**
 * Linear map from a video-pixel point into the zoom canvas — the exact inverse
 * of the drawImage crop scale (spec §6.4). `dot` must already be in intrinsic
 * video pixels.
 */
export function toZoomSpace(
  dot: ZoomPoint,
  crop: CropRect,
  canvas: { w: number; h: number },
): ZoomPoint {
  return {
    X: crop.sw === 0 ? 0 : ((dot.X - crop.sx) / crop.sw) * canvas.w,
    Y: crop.sh === 0 ? 0 : ((dot.Y - crop.sy) / crop.sh) * canvas.h,
  };
}

/** Guitar finger name → the 0..4 finger number the schematic strip renders. */
const FINGER_NUM: Record<string, number> = { thumb: 0, index: 1, middle: 2, ring: 3, pinky: 4 };

/**
 * Convert a lesson step's FusionTarget into a display Voicing (spec §6 fallback):
 * per-string absolute frets (index 0 = string 1), fretted strings from the
 * canonical fingering, expected-but-unfingered strings as OPEN (0), avoid
 * strings as MUTED (-1), everything else muted. `null` in → `null` out (the
 * strip renders the empty schematic board — the pane never blanks).
 */
export function lessonTargetToVoicing(target: FusionTarget | null): ExploreTarget {
  if (!target) return null;
  const frets = new Array<number>(6).fill(-1);
  const fingers = new Array<number>(6).fill(0);
  let maxFret = 0;

  for (const [finger, p] of Object.entries(target.fingering)) {
    if (!p) continue;
    const i = p.string - 1;
    frets[i] = p.fret;
    fingers[i] = FINGER_NUM[finger] ?? 0;
    if (p.fret > maxFret) maxFret = p.fret;
  }
  for (const s of target.expectedStrings) {
    const i = s - 1;
    if (frets[i] === -1) frets[i] = 0; // expected + unfingered → open
  }
  for (const s of target.avoidStrings) {
    frets[s - 1] = -1; // avoid → muted (overrides any stray open)
  }

  return {
    kind: "chord",
    root: "",
    suffix: "",
    active: 0,
    voicings: [
      {
        frets,
        fingers,
        barres: [],
        baseFret: 1,
        window: [0, Math.max(MAX_FRET, maxFret)],
        difficulty: 0,
      },
    ],
  };
}
