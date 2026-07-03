// COPY of apps/web/src/perception/vision/homography.ts (WP-6). The
// fretboard-grid overlay needs a 4-corner quad → grid mapping (forward, to
// draw the grid) and its inverse (to turn a click inside the quad into a
// normalized fretboard point for fretboard.ts). This pure-TS DLT solver is
// exactly that tool and is already unit-proven in the perception leg — reuse
// rather than re-derive. KEEP IN SYNC by hand — apps/web/src/perception/
// vision/homography.ts is the source of truth and is owned by WP-3.
//
// Pure-TS planar homography (3×3).
//   • solveHomography(src,dst): the 4-point DLT. Mathematically IDENTICAL to
//     cv.getPerspectiveTransform.
//   • applyHomography / invertHomography for projecting points and drawing the
//     grid back into image space.

export type Point = { x: number; y: number };
/** Row-major 3×3: [h0 h1 h2 h3 h4 h5 h6 h7 h8]. */
export type Homography = number[];

export const IDENTITY_HOMOGRAPHY: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Solve a 8×8 linear system A x = b by Gaussian elimination with partial
 *  pivoting. Returns null if singular. */
function solve8(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Augment.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null; // singular
    [M[col], M[piv]] = [M[piv], M[col]];
    // Eliminate.
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  // After full elimination M is diagonal: x[i] = M[i][n] / M[i][i].
  return M.map((row, i) => row[n] / row[i]);
}

/** Compute the homography mapping the four `src` points to the four `dst`
 *  points (order-matched). Throws if the correspondence is degenerate. */
export function solveHomography(src: Point[], dst: Point[]): Homography {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("solveHomography needs exactly 4 point correspondences");
  }
  // Standard DLT with h8 fixed to 1: 8 unknowns (h0..h7).
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solve8(A, b);
  if (!h) throw new Error("degenerate correspondence — homography is singular");
  return [...h, 1];
}

/** Project a point through a homography. */
export function applyHomography(H: Homography, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/** Invert a 3×3 homography (for projecting fretboard-space points back into
 *  image space, e.g. drawing the fret grid over the video). */
export function invertHomography(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const Hh = b * g - a * h;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) throw new Error("homography not invertible");
  const s = 1 / det;
  return [A * s, B * s, C * s, D * s, E * s, F * s, G * s, Hh * s, I * s];
}

/** Max reprojection error (Euclidean) of `src`→`dst` under H. */
export function reprojectionError(H: Homography, src: Point[], dst: Point[]): number {
  let max = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyHomography(H, src[i]);
    max = Math.max(max, Math.hypot(p.x - dst[i].x, p.y - dst[i].y));
  }
  return max;
}
