import { describe, expect, it } from "vitest";
import type { FingerAssign } from "../../fusion/events/visionEvents";
import { DEMO_C_MAJOR, perStringStatus } from "./demoTarget";

const a = (finger: FingerAssign["finger"], string: number, fret: number, conf: number): FingerAssign => ({
  finger,
  string,
  fret,
  conf,
});

describe("perStringStatus (vision-only demo, C major)", () => {
  it("greens a correctly fretted string, warns an open string that's being muted", () => {
    const st = perStringStatus([
      a("ring", 5, 3, 0.9), // string 5 wants fret 3 → correct
      a("index", 3, 1, 0.9), // string 3 wants open (0) → a finger frets it → warn
    ]);
    expect(st[5]).toBe("correct");
    expect(st[3]).toBe("warn");
  });

  it("errors a fretted target string with no finger on it", () => {
    expect(perStringStatus([])[2]).toBe("error"); // string 2 wants fret 1
  });

  it("warns when a finger is on the string but the wrong fret", () => {
    expect(perStringStatus([a("index", 2, 3, 0.9)])[2]).toBe("warn"); // wants fret 1
  });

  it("flags a must-mute string as error only when confidently fretted", () => {
    expect(perStringStatus([a("pinky", 6, 2, 0.9)])[6]).toBe("error"); // string 6 must stay muted
    expect(perStringStatus([])[6]).toBe("uncertain");
  });

  it("open string with no finger is correct", () => {
    expect(perStringStatus([])[1]).toBe("correct"); // string 1 open, nothing muting it
  });

  it("covers all six strings", () => {
    const st = perStringStatus([]);
    expect(Object.keys(st).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DEMO_C_MAJOR[6].fret).toBeNull();
  });
});
