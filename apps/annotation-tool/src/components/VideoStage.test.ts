import { describe, expect, it } from "vitest";
import { stepFrame } from "./VideoStage";

describe("stepFrame", () => {
  it("advances by exactly one frame at the given fps", () => {
    expect(stepFrame(1, 30, 1)).toBeCloseTo(1 + 1 / 30, 9);
  });

  it("steps back by one frame", () => {
    expect(stepFrame(1, 30, -1)).toBeCloseTo(1 - 1 / 30, 9);
  });

  it("clamps at zero when stepping back past the start", () => {
    expect(stepFrame(0, 30, -1)).toBe(0);
  });
});
