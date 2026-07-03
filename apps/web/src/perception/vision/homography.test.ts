import { describe, expect, it } from "vitest";
import {
  IDENTITY_HOMOGRAPHY,
  applyHomography,
  invertHomography,
  reprojectionError,
  solveHomography,
  type Point,
} from "./homography";

// SYNTHETIC calibration proof (no camera): a known 4-corner correspondence must
// map its own points with ~0 reprojection error, and arbitrary points must
// round-trip through the inverse.
describe("solveHomography (pure-TS getPerspectiveTransform equivalent)", () => {
  const src: Point[] = [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.15 },
    { x: 0.85, y: 0.7 },
    { x: 0.15, y: 0.75 },
  ];
  // Destination = a unit square (normalized fretboard corners).
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  it("maps the four calibration corners with reprojection error ≈ 0 [synthetic]", () => {
    const H = solveHomography(src, dst);
    expect(reprojectionError(H, src, dst)).toBeLessThan(1e-9);
  });

  it("is invertible and round-trips an interior point [synthetic]", () => {
    const H = solveHomography(src, dst);
    const Hinv = invertHomography(H);
    const p: Point = { x: 0.42, y: 0.37 };
    const back = applyHomography(Hinv, applyHomography(H, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("identity homography is a no-op", () => {
    const p: Point = { x: 0.3, y: 0.6 };
    const out = applyHomography(IDENTITY_HOMOGRAPHY, p);
    expect(out.x).toBeCloseTo(0.3, 12);
    expect(out.y).toBeCloseTo(0.6, 12);
  });

  it("recovers a pure translation exactly", () => {
    const s = dst; // unit square
    const t: Point[] = dst.map((p) => ({ x: p.x + 0.25, y: p.y - 0.1 }));
    const H = solveHomography(s, t);
    expect(applyHomography(H, { x: 0.5, y: 0.5 })).toMatchObject({
      x: expect.closeTo(0.75, 9),
      y: expect.closeTo(0.4, 9),
    });
  });

  it("throws on a degenerate (collinear) correspondence", () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(() => solveHomography(collinear, dst)).toThrow();
  });
});
