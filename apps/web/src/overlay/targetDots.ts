// Lesson target finger dots (overlay UX): project the current step's canonical
// fingering into IMAGE space via the INVERSE calibration homography, so a dot
// sits over the real fret cell on the live video. Pure geometry — the draw code
// and the unit tests both call `planTargets`; nothing here touches a canvas.
import { applyHomography, invertHomography, type Homography } from "../perception/vision/homography";
import { fretLineX, stringY } from "../perception/vision/fretboard";
import type { Fingering } from "../fusion/lessons";

/** The current lesson step's target, mirrored into overlay hot-state so the
 *  frame callback can draw dots without going through React. */
export interface FusionTarget {
  /** Canonical (first accepted) fingering: finger → { string, fret }. */
  fingering: Fingering;
  expectedStrings: number[];
  avoidStrings: number[];
}

export type DotKind = "finger" | "open" | "avoid";

export interface TargetDot {
  kind: DotKind;
  string: number;
  /** finger name (finger dots only). */
  finger?: string;
  fret?: number;
  /** Image-space pixel position (already scaled by canvas w/h). */
  X: number;
  Y: number;
}

export interface TargetPlan {
  dots: TargetDot[];
  /** Lesson active but not calibrated → show the "calibrate to see targets" nudge. */
  nudge: boolean;
}

/** Teaching position: fret n is pressed just behind fret line n — 70% of the way
 *  from the previous line toward it. Open (fret 0) sits at the nut. */
const BEHIND = 0.7;
export function targetX(fret: number): number {
  if (fret <= 0) return fretLineX(0); // open string → at the nut edge
  return fretLineX(fret - 1) + BEHIND * (fretLineX(fret) - fretLineX(fret - 1));
}

const INITIALS: Record<string, string> = { thumb: "T", index: "I", middle: "M", ring: "R", pinky: "P" };
export function fingerInitial(finger: string): string {
  return INITIALS[finger] ?? finger[0]?.toUpperCase() ?? "?";
}

/** Project the step's target into image-space dots. `H` is the image→fretboard
 *  homography; we invert it to map fretboard-normalized points back to image. */
export function targetDots(target: FusionTarget, H: Homography, w: number, h: number): TargetDot[] {
  const Hinv = invertHomography(H); // fretboard-normalized → image-normalized
  const toXY = (x: number, y: number) => {
    const p = applyHomography(Hinv, { x, y });
    return { X: p.x * w, Y: p.y * h };
  };
  const dots: TargetDot[] = [];
  const fingered = new Set<number>();
  for (const [finger, p] of Object.entries(target.fingering)) {
    if (!p) continue;
    fingered.add(p.string);
    const { X, Y } = toXY(targetX(p.fret), stringY(p.string));
    dots.push({ kind: p.fret <= 0 ? "open" : "finger", string: p.string, finger, fret: p.fret, X, Y });
  }
  // Expected strings with no finger = open strings that must ring → subtle nut marker.
  for (const s of target.expectedStrings) {
    if (fingered.has(s)) continue;
    const { X, Y } = toXY(fretLineX(0), stringY(s));
    dots.push({ kind: "open", string: s, X, Y });
  }
  // Avoid strings → "don't play" mark at the nut.
  for (const s of target.avoidStrings) {
    const { X, Y } = toXY(fretLineX(0), stringY(s));
    dots.push({ kind: "avoid", string: s, X, Y });
  }
  return dots;
}

/** Full overlay-target plan: dots when active+calibrated, a nudge flag when a
 *  lesson is running but there is no calibration (never fake positions). */
export function planTargets(
  active: boolean,
  H: Homography | null,
  target: FusionTarget | null,
  w: number,
  h: number,
): TargetPlan {
  if (!active || !target) return { dots: [], nudge: false };
  if (!H) return { dots: [], nudge: true };
  return { dots: targetDots(target, H, w, h), nudge: false };
}
