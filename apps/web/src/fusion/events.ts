// Shared perception event schema consumed by the WP-4 fusion engine.
// opus-stack-implementation-plan §9.1 is the source of truth for these shapes.
//
// ── AUDIO (WP-2) ────────────────────────────────────────────────────────────
export type { AudioEvent } from "./audioEvents";

// ── VISION (WP-3) ───────────────────────────────────────────────────────────
// The vision leg adds `VisionEvent` here (own file re-exported, same pattern):
//   export type { VisionEvent } from "./visionEvents";
//
// ── FUSION OUTPUT (WP-4) ────────────────────────────────────────────────────
// `Diagnosis` (fusion output → feedback policy) lands with the fusion engine.
