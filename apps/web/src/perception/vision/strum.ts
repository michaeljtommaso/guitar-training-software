// Strum-hand direction from wrist-velocity (WP-3). Pure heuristic over recent
// wrist samples (MediaPipe landmark 0). Down = wrist moving toward the floor
// (increasing image y, since image y grows downward); up = decreasing y; none =
// below the velocity threshold.
import type { StrumDir } from "../../fusion/events/visionEvents";

export interface WristSample {
  /** timestamp (audioClock ms) */
  t: number;
  /** wrist y in image-normalized coords [0..1], y grows downward */
  y: number;
}

/** Minimum mean vertical speed (normalized-units per second) to count as a
 *  stroke rather than a hold. ~0.4 ⇒ crossing ~40% of frame height in 1 s. */
export const STRUM_SPEED_THRESHOLD = 0.4;

/**
 * Classify the most recent stroke from a short history (oldest→newest, or any
 * order — we sort by t). Uses the net displacement over the sampled window and
 * the fraction of steps that agree in sign (consistency) for confidence.
 */
export function classifyStrum(samples: WristSample[], windowMs = 250): { dir: StrumDir; conf: number } {
  if (samples.length < 2) return { dir: "none", conf: 0 };
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const newest = sorted[sorted.length - 1].t;
  const win = sorted.filter((s) => newest - s.t <= windowMs);
  if (win.length < 2) return { dir: "none", conf: 0 };

  const first = win[0];
  const last = win[win.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { dir: "none", conf: 0 };

  const velocity = (last.y - first.y) / dt; // normalized units / sec, signed

  // Consistency: fraction of consecutive steps moving the same way as the net.
  let agree = 0;
  let steps = 0;
  for (let i = 1; i < win.length; i++) {
    const d = win[i].y - win[i - 1].y;
    if (d === 0) continue;
    steps++;
    if (Math.sign(d) === Math.sign(velocity)) agree++;
  }
  const consistency = steps === 0 ? 0 : agree / steps;

  const speed = Math.abs(velocity);
  if (speed < STRUM_SPEED_THRESHOLD) return { dir: "none", conf: clamp01(speed / STRUM_SPEED_THRESHOLD) * 0.5 };

  // Confidence grows with speed above threshold and with directional
  // consistency; saturates around 2× threshold.
  const speedConf = clamp01((speed - STRUM_SPEED_THRESHOLD) / STRUM_SPEED_THRESHOLD);
  const conf = clamp01(0.5 * speedConf + 0.5 * consistency);
  return { dir: velocity > 0 ? "down" : "up", conf: round3(conf) };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
