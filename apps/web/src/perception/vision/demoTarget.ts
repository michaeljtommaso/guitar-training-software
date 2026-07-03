// Hardcoded demo target chord + vision-only per-string status for the overlay
// R/Y/G bars (WP-3 deliverable 6). This is a PLACEHOLDER status: vision alone
// can't hear whether a string rang — real correctness is WP-4 audio+vision
// fusion. Here we only reflect where the fingers appear to be vs the target.
import type { StatusKey } from "../../theme/statusColors";
import type { FingerAssign } from "../../fusion/events/visionEvents";

export interface StringTarget {
  /** Expected fret: 0 = open, >0 = fretted, null = string should stay muted. */
  fret: number | null;
}

// Open C major, x32010 (string 6 muted … string 1 open).
export const DEMO_C_MAJOR: Record<number, StringTarget> = {
  1: { fret: 0 },
  2: { fret: 1 },
  3: { fret: 0 },
  4: { fret: 2 },
  5: { fret: 3 },
  6: { fret: null },
};

const CONF_OK = 0.6;
const CONF_PRESENT = 0.5;

/** Per-string status vs the demo target (strings 1..6). */
export function perStringStatus(
  assigns: FingerAssign[],
  target: Record<number, StringTarget> = DEMO_C_MAJOR,
): Record<number, StatusKey> {
  const status: Record<number, StatusKey> = {};
  for (let s = 1; s <= 6; s++) {
    const t = target[s]?.fret;
    const on = assigns.filter((a) => a.string === s);
    const fretted = on.some((a) => a.conf > CONF_PRESENT && a.fret > 0);
    if (t === null || t === undefined) {
      status[s] = fretted ? "error" : "uncertain"; // should stay muted
    } else if (t === 0) {
      status[s] = fretted ? "warn" : "correct"; // open string, don't mute it
    } else if (on.some((a) => a.fret === t && a.conf > CONF_OK)) {
      status[s] = "correct"; // right finger, right fret
    } else if (on.length > 0) {
      status[s] = "warn"; // a finger is near but off / uncertain
    } else {
      status[s] = "error"; // nothing on a string that needs fretting
    }
  }
  return status;
}
