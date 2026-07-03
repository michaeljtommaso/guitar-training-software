// Fingertip → string/fret mapping (WP-3 core math). Pure and deterministic:
// project each fretting fingertip through the calibration homography into
// normalized fretboard space, then read off nearest string, fret cell,
// behind-fret distance and adjacent-string mute risk, with a per-assignment
// confidence fused from landmark presence and homography confidence.
//
// mapFingertips returns rich FingerReadings (with the diagnostics the overlay
// and fusion want); toAssigns() strips them to the exact §9.1 FingerAssign
// shape the VisionEvent 'fingerAssign' carries.
//
// Fingertip landmark indices in the MediaPipe 21-point hand model:
//   4 thumb, 8 index, 12 middle, 16 ring, 20 pinky.
import type { FingerAssign, Finger, Landmark } from "../../fusion/events/visionEvents";
import { applyHomography, type Homography, type Point } from "./homography";
import { fretForX, nearestString, onBoard, MAX_FRET } from "./fretboard";

export const FINGERTIP_LANDMARKS: { finger: Finger; index: number }[] = [
  { finger: "thumb", index: 4 },
  { finger: "index", index: 8 },
  { finger: "middle", index: 12 },
  { finger: "ring", index: 16 },
  { finger: "pinky", index: 20 },
];

// Strings are 0.2 apart in normalized fretboard y.
const STRING_SPACING = 0.2;

/** A fingertip reading — the §9.1 FingerAssign fields plus diagnostics used by
 *  the overlay (halo tint) and fusion (mute risk, behind-fret placement). */
export interface FingerReading extends FingerAssign {
  /** Normalized distance BEHIND the leading fret line (small = right on it). */
  behindFretDist: number;
  /** 0..1 risk of muting an adjacent string (lateral drift). */
  muteRisk: number;
  /** True when the fingertip lands in the playable nut→MAX_FRET window. */
  onWindow: boolean;
}

export interface MapOptions {
  /** 0..1 homography confidence (decays when the marker is lost, WP-3 §7). */
  homographyConf: number;
  /** Optional per-landmark presence/visibility 0..1 (defaults to 1). */
  presence?: number[];
  /** Include the thumb in the output (default false — rarely frets). */
  includeThumb?: boolean;
}

/** Adjacent-string mute risk 0..1 (1 = high risk of muting a neighbour). */
export function muteRisk(distToLine: number, distToAdjacent: number): number {
  const toward = 1 - (distToAdjacent - distToLine) / STRING_SPACING;
  return clamp01(toward);
}

/** Confidence for one assignment: high when the fingertip sits squarely in a
 *  cell, on a string, with a confident homography and a present landmark; low
 *  near a string boundary (mute risk) or off the board. */
function assignConfidence(
  homographyConf: number,
  presence: number,
  distToLine: number,
  distToAdjacent: number,
  onWindow: boolean,
): number {
  const centered = Math.max(0, 1 - distToLine / (STRING_SPACING / 2));
  const separation = clamp01((distToAdjacent - distToLine) / STRING_SPACING);
  const boardFactor = onWindow ? 1 : 0.5;
  return clamp01(homographyConf * presence * centered * separation * boardFactor);
}

/** Map a single hand's landmarks (image-normalized [0..1]) to finger readings.
 *  One entry per fretting fingertip. */
export function mapFingertips(landmarks: Landmark[], H: Homography, opts: MapOptions): FingerReading[] {
  const { homographyConf, presence, includeThumb = false } = opts;
  const out: FingerReading[] = [];
  for (const { finger, index } of FINGERTIP_LANDMARKS) {
    if (finger === "thumb" && !includeThumb) continue;
    const lm = landmarks[index];
    if (!lm) continue;
    const fb = applyHomography(H, { x: lm[0], y: lm[1] } as Point);

    const { string, distToLine, distToAdjacent } = nearestString(fb.y);
    const { fret, behindFretDist } = fretForX(fb.x);
    const pres = presence?.[index] ?? 1;
    const onWindow = fret >= 1 && fret <= MAX_FRET && onBoard(fb.x, fb.y);
    const conf = assignConfidence(homographyConf, pres, distToLine, distToAdjacent, onWindow);

    out.push({
      finger,
      string,
      fret: Math.min(fret, MAX_FRET + 1),
      conf: round3(conf),
      behindFretDist: round3(behindFretDist),
      muteRisk: round3(muteRisk(distToLine, distToAdjacent)),
      onWindow,
    });
  }
  return out;
}

/** Strip rich readings to the §9.1 FingerAssign shape for the event
 *  (+ behindFretDist, the WP-4 additive field fusion needs for behind_fret). */
export function toAssigns(readings: FingerReading[]): FingerAssign[] {
  return readings.map(({ finger, string, fret, conf, behindFretDist }) => ({
    finger,
    string,
    fret,
    conf,
    behindFretDist,
  }));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
