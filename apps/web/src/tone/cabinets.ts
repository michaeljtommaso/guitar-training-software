// Bundled cabinet IRs: real, license-clean (CC0) guitar-cab impulse responses
// served as static assets from public/irs/ and loaded at runtime via
// tone.loadIR(). The synthetic IR (cabIR.ts) stays the default fallback — these
// are opt-in through the cab picker. Provenance, source URLs, licences and
// sha256 for every file live in public/irs/MANIFEST.md (ADR-011 firewall:
// CC0/CC-BY assets only). UI labels are descriptive, never trademarked amp/brand
// names — the factual capture source lives in the manifest, not the UI.
export interface Cabinet {
  /** Stable key (also the cab-picker <option> value and the .wav basename). */
  id: string;
  /** UI-facing descriptive name. No brand/trademark names. */
  label: string;
  /** Path under public/, fetched at runtime and decoded into the ConvolverNode. */
  file: string;
}

export const BUNDLED_CABINETS: Cabinet[] = [
  { id: "vintage-4x12", label: "Vintage 4x12", file: "/irs/vintage-4x12.wav" },
  { id: "clean-1x12", label: "Clean 1x12 Combo", file: "/irs/clean-1x12-combo.wav" },
  { id: "tweed-4x10", label: "Tweed 4x10", file: "/irs/tweed-4x10.wav" },
];
