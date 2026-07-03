import { describe, expect, it } from "vitest";
import {
  MAX_FRET,
  fretForX,
  fretLineX,
  nearestString,
  onBoard,
  stringY,
} from "./fretboard";

describe("fret spacing (real, not uniform)", () => {
  it("fret lines are monotonic and pinned at 0 (nut) and 1 (MAX_FRET)", () => {
    expect(fretLineX(0)).toBeCloseTo(0, 12);
    expect(fretLineX(MAX_FRET)).toBeCloseTo(1, 12);
    for (let n = 1; n <= MAX_FRET; n++) {
      expect(fretLineX(n)).toBeGreaterThan(fretLineX(n - 1));
    }
  });

  it("uses equal-tempered (compressing) spacing, not uniform", () => {
    // Uniform spacing would put fret 1 at 1/MAX_FRET = 0.2; real spacing is
    // wider than that for the first fret and cells shrink toward the body.
    expect(fretLineX(1)).toBeGreaterThan(1 / MAX_FRET);
    const cell1 = fretLineX(1) - fretLineX(0);
    const cell5 = fretLineX(5) - fretLineX(4);
    expect(cell1).toBeGreaterThan(cell5); // frets get closer together
  });
});

describe("string lines", () => {
  it("string 6 (low E) at y=0, string 1 (high e) at y=1, evenly spaced", () => {
    expect(stringY(6)).toBeCloseTo(0, 12);
    expect(stringY(1)).toBeCloseTo(1, 12);
    expect(stringY(3) - stringY(4)).toBeCloseTo(0.2, 12);
  });

  it("nearestString snaps to the closest line and reports neighbour distance", () => {
    const r = nearestString(stringY(3) + 0.01);
    expect(r.string).toBe(3);
    expect(r.distToLine).toBeCloseTo(0.01, 9);
    expect(r.distToAdjacent).toBeCloseTo(0.19, 9);
  });
});

describe("fretForX cells", () => {
  it("assigns the cell whose leading fret line the x sits behind", () => {
    const mid2 = (fretLineX(1) + fretLineX(2)) / 2;
    const r = fretForX(mid2);
    expect(r.fret).toBe(2);
    expect(r.behindFretDist).toBeCloseTo(fretLineX(2) - mid2, 9);
  });

  it("x ≤ 0 is open (fret 0), reporting how far behind the nut", () => {
    expect(fretForX(0).fret).toBe(0);
    expect(fretForX(-0.1)).toEqual({ fret: 0, behindFretDist: expect.closeTo(0.1, 9) });
  });

  it("x > 1 is past the window (fret MAX_FRET+1)", () => {
    expect(fretForX(1.2).fret).toBe(MAX_FRET + 1);
  });
});

describe("onBoard", () => {
  it("is true only inside the unit square", () => {
    expect(onBoard(0.5, 0.5)).toBe(true);
    expect(onBoard(-0.01, 0.5)).toBe(false);
    expect(onBoard(0.5, 1.01)).toBe(false);
  });
});
