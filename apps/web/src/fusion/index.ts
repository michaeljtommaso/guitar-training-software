// Placeholder — deterministic fusion engine and lessons-as-data loader land in
// WP-4. The typed, confidence-carrying event schema (§9.1) lives under ./events,
// one union per perception leg so the legs don't collide on merge.

// ── WP-3 (vision) ──
export * from "./events/visionEvents";
// ── WP-2 (audio) ──
export * from "./events/audioEvents";
