// Confidence-gated wrong/right flash (ADR-007 FALSE-POSITIVE-AVERSE): a red
// edge-glow on a CONFIDENT critical diagnosis, a green pulse on a CONFIDENT ok,
// and — deliberately — SILENCE below the confident gate. A wrong confident
// correction costs more trust than a missed one, so an uncertain diagnosis
// never flashes. Pure gate: the confidence gate and the rate-limit window are
// IMPORTED from the feedback policy (never re-declared), so the flash can never
// drift out of sync with the hint policy.
import { DEFAULT_POLICY_CONFIG } from "../fusion/feedbackPolicy";
import type { Diagnosis, DiagnosisCode } from "../fusion/diagnosis";
import type { StatusKey } from "../theme/statusColors";

/** How long a single flash is shown on the display clock. */
export const FLASH_MS = 250;

const CONFIDENT_GATE = DEFAULT_POLICY_CONFIG.confidentGate;
/** No two flashes closer than the feedback-policy window (no strobing). */
const FLASH_WINDOW_MS = DEFAULT_POLICY_CONFIG.windowMs;

/** Codes that warrant a red flash when confident. `ok` → green; anything else
 *  (there is nothing else in the code set today) → no flash. */
const CRITICAL: ReadonlySet<DiagnosisCode> = new Set<DiagnosisCode>([
  "wrong_fret",
  "wrong_string",
  "muted_string",
  "behind_fret",
  "missing_note",
  "late_strum",
]);

export interface Flash {
  /** "error" (confident wrong) or "correct" (confident ok). */
  color: Extract<StatusKey, "error" | "correct">;
  /** Diagnosis event-time that triggered it: rate-limit key AND the display
   *  trigger the overlay watches to (re)start its FLASH_MS window. */
  t: number;
}

/**
 * Pure flash gate. Returns a flash only when the diagnosis clears the confident
 * gate, carries a flashable code, and the event-time rate-limit window has
 * elapsed since the last flash (`lastT`). Below the gate → null (silence).
 */
export function flashFor(d: Diagnosis, lastT: number): Flash | null {
  if (d.conf < CONFIDENT_GATE) return null; // ADR-007: silence over false alarms
  if (d.t - lastT < FLASH_WINDOW_MS) return null; // rate-limit: no strobing
  if (d.code === "ok") return { color: "correct", t: d.t };
  if (CRITICAL.has(d.code)) return { color: "error", t: d.t };
  return null;
}
