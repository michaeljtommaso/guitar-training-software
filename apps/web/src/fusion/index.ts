// Fusion module (WP-4): §9.1 event schema (./events), Diagnosis + Zod
// boundaries (./diagnosis), the deterministic engine (./engine), the
// trust-preserving feedback policy (./feedbackPolicy), lessons-as-data
// (./lessons + /data/lessons/*.json), and the Dexie session log (./sessionLog).
//
// ─────────────────────────────────────────────────────────────────────────────
// STRING NUMBERING everywhere: 1 = high e (thinnest) … 6 = low E (thickest).
// This is the STANDARD guitar convention and it is used across BOTH perception
// legs — audio (tuning events, stringValidation) and vision (fingerAssign,
// fretboard mapping). Any code, test, or lessons datum carrying a `string`
// number MUST use it.
//
// Note: docs/opus-stack-implementation-plan.md §9.4's example fingering lists
// `avoid_strings:[1]` for open C major — but C major mutes the LOW E, so under
// this standard convention that example must read `avoid_strings:[6]`. The §9.4
// example uses the opposite (low-E-first) numbering; the fingerings themselves
// (index→string:2, middle→string:4, ring→string:5) are already standard.
// Resolved 2026-07-03 during WP-2/WP-3 integration; lessons data (WP-4) must
// use standard numbering.
// ─────────────────────────────────────────────────────────────────────────────

// ── WP-3 (vision) ──
export * from "./events/visionEvents";
// ── WP-2 (audio) ──
export * from "./events/audioEvents";
// ── WP-4 (fusion) ──
export * from "./diagnosis";
export * from "./engine";
export * from "./feedbackPolicy";
export * from "./lessons";
export * from "./sessionLog";
