// Plain-language advice for the Setup Wizard's measured round-trip latency
// (the "clap test" in latencyProbe.ts / controller.ts's measureLatency()).
// Pure — no audio, no DOM. Boundaries per docs/research/
// amp-modeling-and-tone-engine-research.md ("Good target: <10-12 ms round
// trip for amp monitoring") and RESULT-003 in the phase-0 findings (a 52 ms
// built-in-mic round trip produced audible slapback echo with no in-app
// explanation that a USB audio interface fixes it).
import type { AudioInputKind } from "./devices";

export type LatencyTier = "great" | "usable" | "echo";

export interface LatencyAdvice {
  tier: LatencyTier;
  message: string;
}

/** At/below this, amp monitoring should feel real-time. */
export const GREAT_MAX_MS = 12;
/** At/below this, monitoring is usable but a delay is noticeable. */
export const USABLE_MAX_MS = 30;

const INTERFACE_FIX = "a USB audio interface (Hi-Z input) fixes this";

/**
 * Map a measured round-trip latency (ms) to a tier + plain-language message.
 * `kind` (from classifyAudioInput) lets the "echo" tier explain *why*
 * (built-in mic path) and avoid recommending gear the player already has.
 */
export function adviseLatency(ms: number, kind: AudioInputKind = "unknown"): LatencyAdvice {
  if (ms <= GREAT_MAX_MS) {
    return {
      tier: "great",
      message: "Great — real-time amp monitoring will feel immediate.",
    };
  }
  if (ms <= USABLE_MAX_MS) {
    return {
      tier: "usable",
      message: "Usable, but you may notice a slight delay when monitoring through the amp.",
    };
  }
  if (kind === "interface") {
    return {
      tier: "echo",
      message: "You'll hear a distinct echo at this latency — check your interface's buffer size or driver settings.",
    };
  }
  return {
    tier: "echo",
    message: `You'll hear a distinct echo at this latency — it's the built-in mic path; ${INTERFACE_FIX}.`,
  };
}
