// Main-thread status palette. Unlike the vision WORKER (no CSS access → uses the
// mirrored STATUS_COLORS light-theme constants), the overlay canvas runs on the
// MAIN thread and CAN read resolved CSS custom properties. Per the WP-0 reviewer
// note we resolve --correct/--warn/--error/--uncertain via getComputedStyle so
// the DARK theme's distinct hex is honored too. Re-resolve on theme change.
import { STATUS_COLORS, type StatusKey } from "../theme/statusColors";

export type StatusPalette = Record<StatusKey, string>;

export function resolveStatusColors(el: Element = document.documentElement): StatusPalette {
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    correct: read("--correct", STATUS_COLORS.correct),
    warn: read("--warn", STATUS_COLORS.warn),
    error: read("--error", STATUS_COLORS.error),
    uncertain: read("--uncertain", STATUS_COLORS.uncertain),
  };
}

/** Map a confidence [0..1] to a status color (green ≥0.6, amber ≥0.3, else red). */
export function confColor(conf: number, p: StatusPalette): string {
  if (conf >= 0.6) return p.correct;
  if (conf >= 0.3) return p.warn;
  return p.error;
}
