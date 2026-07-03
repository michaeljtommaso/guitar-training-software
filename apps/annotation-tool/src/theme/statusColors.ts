// COPY of apps/web/src/theme/statusColors.ts (WP-6, internal tool — canvas
// heatmaps/overlays here need the same plain-hex status triad the web app
// uses; CSS custom properties aren't readable from canvas). KEEP IN SYNC by
// hand with tokens.css's light-theme semantic tokens if those ever change.
export const STATUS_COLORS = {
  correct: "#22c55e",
  warn: "#f59e0b",
  error: "#ef4444",
  uncertain: "#94a3b8",
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;
