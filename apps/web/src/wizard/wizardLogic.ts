// Pure helpers for the v2 Wizard (spec §7) — kept side-effect-free so they're
// directly unit-testable without mounting React or touching stores.
import type { AudioInputKind } from "../capture/devices";

/** ADR-013 badge: shown only when the classified input is a direct interface. */
export function isDirectInput(kind: AudioInputKind): boolean {
  return kind === "interface";
}

export interface WizardSummaryInput {
  /** Selected camera's device label (empty string → "Default camera"). */
  cameraLabel: string;
  /** Whether a fretboard calibration is currently held (visionHot.H !== null). */
  calibrated: boolean;
  /** Selected/active input's device label (empty string → "Default microphone"). */
  inputLabel: string;
  inputKind: AudioInputKind;
  /** Latest RMS level in dBFS, or null if no audio health reading is available yet. */
  inputLevelDb: number | null;
  /** Open strings confirmed clean this session (0-6). */
  openStringsSeen: number;
  /** Measured acoustic round-trip latency (ms), or null if never measured. */
  latencyMs: number | null;
}

export interface WizardSummary {
  cameraLine: string;
  zoomLine: string;
  inputLine: string;
  openStringsLine: string;
}

const KIND_LABEL: Record<AudioInputKind, string> = {
  interface: "direct input",
  mic: "mic",
  unknown: "input",
};

/**
 * Compose the step-3 "You're set" summary lines (spec §7) from real captured
 * state only — no placeholder/fake values. Unmeasured fields render an honest
 * "not measured" rather than a fabricated number.
 */
export function composeWizardSummary(input: WizardSummaryInput): WizardSummary {
  const camera = input.cameraLabel || "Default camera";
  const mic = input.inputLabel || "Default microphone";
  const level = input.inputLevelDb === null ? "not measured" : `${Math.round(input.inputLevelDb)} dB`;
  const roundTrip = input.latencyMs === null ? "not measured" : `~${Math.round(input.latencyMs)} ms round trip`;
  return {
    cameraLine: `${camera} — full scene`,
    zoomLine: `fretboard zoom crop — ${input.calibrated ? "calibrated" : "uncalibrated"}`,
    inputLine: `${mic} · ${KIND_LABEL[input.inputKind]} · ${level}`,
    openStringsLine: `open strings ${input.openStringsSeen}/6 · ${roundTrip}`,
  };
}
