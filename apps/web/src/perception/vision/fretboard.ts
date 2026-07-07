// Normalized fretboard coordinate convention (WP-3). This is the single source
// of truth for how a point in "fretboard space" maps to a (string, fret) cell.
// The homography (see homography.ts / opencvCalib.ts) maps camera image space →
// this normalized space; everything downstream (finger mapping, overlay grid)
// speaks these coordinates.
//
// CONVENTION (documented per WP-3 brief):
//   x ∈ [0,1] runs ALONG the neck, nut → fret MAX_FRET, using REAL (equal-
//     tempered) fret spacing, renormalized so the last fret sits at x = 1.
//     Physical distance of fret n from the nut is proportional to
//         1 − 2^(−n/12)
//     so fretLineX(n) = (1 − 2^(−n/12)) / (1 − 2^(−MAX_FRET/12)).
//     x = 0 is the nut (fret line 0); x = 1 is fret line MAX_FRET.
//   y ∈ [0,1] runs ACROSS the strings, string 6 (low E) → string 1 (high e),
//     with the 6 strings on evenly spaced lines:
//         stringY(s) = (6 − s) / 5     → string 6 at y=0, string 1 at y=1.
//
// A "fret cell n" is the span between fret line n−1 and fret line n; a finger
// fretting fret n presses just BEHIND fret line n (nearer the body). Fret 0 =
// open string (finger at/behind the nut, x ≤ 0).

export const NUM_STRINGS = 6;
export const MAX_FRET = 5; // MVP: nut → fret 5 (open-chord window)

/** Equal-tempered fret-line position normalized to an arbitrary window
 *  [start, end] (0 at start's line, 1 at end's). Generalizes fretLineX. */
export function fretX(n: number, start: number, end: number): number {
  const pos = (f: number) => 1 - Math.pow(2, -f / 12);
  return (pos(n) - pos(start)) / (pos(end) - pos(start));
}

/** Normalized x of fret LINE n (n = 0 is the nut). Real equal-tempered spacing,
 *  renormalized so fret line MAX_FRET === 1. */
export function fretLineX(n: number): number {
  return fretX(n, 0, MAX_FRET);
}

/** Normalized y of string `s` (1 = high e … 6 = low E). */
export function stringY(s: number): number {
  return (NUM_STRINGS - s) / (NUM_STRINGS - 1);
}

/** Nearest string to a normalized y, plus the normalized lateral distance to
 *  that string's line and to the closest ADJACENT string line (mute-risk cue). */
export function nearestString(y: number): {
  string: number;
  distToLine: number;
  distToAdjacent: number;
} {
  let best = 1;
  let bestD = Infinity;
  for (let s = 1; s <= NUM_STRINGS; s++) {
    const d = Math.abs(y - stringY(s));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  // Distance to the nearer of the two neighbouring string lines.
  let adj = Infinity;
  for (const s of [best - 1, best + 1]) {
    if (s >= 1 && s <= NUM_STRINGS) adj = Math.min(adj, Math.abs(y - stringY(s)));
  }
  return { string: best, distToLine: bestD, distToAdjacent: adj };
}

/** Which fret CELL a normalized x falls in (0 = open, i.e. at/behind the nut),
 *  plus the normalized distance BEHIND the leading fret line of that cell.
 *  x ≤ 0 → open (fret 0). x > 1 → past MAX_FRET (fret MAX_FRET+1, flagged
 *  off-window by callers). */
export function fretForX(x: number): { fret: number; behindFretDist: number } {
  if (x <= 0) return { fret: 0, behindFretDist: Math.max(0, -x) };
  for (let n = 1; n <= MAX_FRET; n++) {
    if (x <= fretLineX(n)) {
      // Cell n spans [fretLineX(n-1), fretLineX(n)]; "behind the fret" =
      // distance from x to the leading line fretLineX(n).
      return { fret: n, behindFretDist: fretLineX(n) - x };
    }
  }
  return { fret: MAX_FRET + 1, behindFretDist: 0 }; // past the window
}

/** True when a normalized point is on the playable board (within the window). */
export function onBoard(x: number, y: number): boolean {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}
