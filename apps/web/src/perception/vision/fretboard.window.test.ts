import { describe, expect, it } from "vitest";
import { fretLineX, fretX, MAX_FRET } from "./fretboard";

describe("fretX (windowed spacing)", () => {
  it("degenerates to fretLineX over the default window", () => {
    for (let n = 0; n <= MAX_FRET; n++) {
      expect(fretX(n, 0, MAX_FRET)).toBeCloseTo(fretLineX(n), 10);
    }
  });
  it("spans 0..1 across any window, monotonically", () => {
    expect(fretX(3, 3, 8)).toBe(0);
    expect(fretX(8, 3, 8)).toBe(1);
    expect(fretX(5, 3, 8)).toBeGreaterThan(fretX(4, 3, 8));
  });
});
