import { describe, expect, it } from "vitest";
import { defaultQuad, resolveCell } from "./QuadOverlay";
import { fretLineX, stringY } from "../shared/fretboard";

describe("defaultQuad", () => {
  it("insets a rectangle 15% from each edge of the video frame", () => {
    const quad = defaultQuad(1000, 500);
    expect(quad).toEqual([
      [150, 75],
      [850, 75],
      [850, 425],
      [150, 75 + 350],
    ]);
  });
});

describe("resolveCell", () => {
  // Axis-aligned quad spanning the whole 1000x500 frame -> unit-square math
  // applies directly, so we can predict exact pixel positions for known cells.
  const quad: [[number, number], [number, number], [number, number], [number, number]] = [
    [0, 0],
    [1000, 0],
    [1000, 500],
    [0, 500],
  ];

  it("resolves a click at a known fret/string intersection to that cell", () => {
    // fret line 2, string 3 -> pixel (fretLineX(2)*1000, stringY(3)*500).
    const px = fretLineX(2) * 1000 - 1; // just inside cell 2 (behind the line)
    const py = stringY(3) * 500;
    const cell = resolveCell(quad, { x: px, y: py });
    expect(cell).toEqual({ string: 3, fret: 2 });
  });

  it("resolves the nut (x=0) as the open string, fret 0", () => {
    const cell = resolveCell(quad, { x: 0, y: stringY(1) * 500 });
    expect(cell).toEqual({ string: 1, fret: 0 });
  });

  it("returns null for a click outside the quad", () => {
    expect(resolveCell(quad, { x: -10, y: 10 })).toBeNull();
    expect(resolveCell(quad, { x: 10, y: 600 })).toBeNull();
  });
});
