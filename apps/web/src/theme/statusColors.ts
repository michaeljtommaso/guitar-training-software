// Canvas 2D (fret grid, finger halos, R/Y/G string bars — WP-3/WP-4) cannot
// read CSS custom properties, so the status-triad + uncertain colors are
// duplicated here as plain hex constants.
//
// KEEP IN SYNC with the light-theme semantic tokens (--correct/--warn/--error
// /--uncertain) in ./tokens.css. If those raw hex values change, update this
// file to match in the same commit.
export const STATUS_COLORS = {
  correct: "#22c55e",
  warn: "#f59e0b",
  error: "#ef4444",
  uncertain: "#94a3b8",
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;
