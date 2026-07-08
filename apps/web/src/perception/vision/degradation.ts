// Graceful degradation (WP-3 §7): when the marker / calibration leaves frame we
// HOLD the last homography but let its confidence DECAY exponentially with time
// since it was last confirmed. Below OVERLAY_DIM_THRESHOLD the overlay visibly
// dims; the mapping keeps running on the held homography at the reduced
// confidence so a brief occlusion doesn't blank the UI.

/** Confidence half-life: after this many ms unconfirmed, confidence halves. */
export const CALIB_HALF_LIFE_MS = 1500;
/** Below this the overlay dims (and fusion should treat calibration as stale). */
export const OVERLAY_DIM_THRESHOLD = 0.35;

/** Exponentially decay a confidence value given elapsed time since last seen. */
export function decayConfidence(
  lastConf: number,
  msSinceSeen: number,
  halfLifeMs = CALIB_HALF_LIFE_MS,
): number {
  if (msSinceSeen <= 0) return clamp01(lastConf);
  const factor = Math.pow(0.5, msSinceSeen / halfLifeMs);
  return clamp01(lastConf * factor);
}

/** Overlay opacity 0..1 for a given (decayed) calibration confidence: full
 *  above the dim threshold, fading linearly to a floor as it approaches 0. */
export function overlayOpacity(conf: number): number {
  if (conf >= OVERLAY_DIM_THRESHOLD) return 1;
  const OPACITY_FLOOR = 0.15;
  return OPACITY_FLOOR + (1 - OPACITY_FLOOR) * clamp01(conf / OVERLAY_DIM_THRESHOLD);
}

/** Effective calibration confidence for display. A calibration only DECAYS
 *  while it is being live-tracked (a per-frame detector re-confirms it,
 *  re-stamping calibSeenAt). Until markerless/live tracking exists
 *  (docs/plans/markerless-fretboard-tracking.md), calibrations are STATIC:
 *  held at their confirmed confidence with no time decay, so the overlay +
 *  zoom pane stay solid after a one-shot manual/ChArUco calibration. */
export function effectiveCalibConf(
  hasCalib: boolean,
  calibConf: number,
  msSinceSeen: number,
  live: boolean,
): number {
  if (!hasCalib) return 0;
  if (!live) return clamp01(calibConf);
  return decayConfidence(calibConf, msSinceSeen);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
