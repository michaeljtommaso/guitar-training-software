import { describe, expect, it } from "vitest";
import { planTargets, targetDots, targetX, exploreDots, type FusionTarget } from "./targetDots";
import { IDENTITY_HOMOGRAPHY } from "../perception/vision/homography";
import { fretLineX, stringY } from "../perception/vision/fretboard";
import { getLesson } from "../fusion/lessons";
import type { ExploreTarget } from "../explore/exploreStore";

const W = 1280;
const H = 720;

// The shipped C-major step, built exactly as fusionStore.targetFor does.
const cMajorStep = getLesson("open_chords_c_major")!.steps[0];
const cTarget: FusionTarget = {
  fingering: cMajorStep.accepted_fingerings[0],
  expectedStrings: cMajorStep.expected_strings,
  avoidStrings: cMajorStep.avoid_strings,
};

describe("targetDots projection (identity homography, C major)", () => {
  const dots = targetDots(cTarget, IDENTITY_HOMOGRAPHY, W, H);
  const byFinger = (f: string) => dots.find((d) => d.finger === f)!;

  it("places the 3 fingered dots just behind their fret lines (from fretLineX/stringY)", () => {
    // index → string 2, fret 1
    const idx = byFinger("index");
    expect(idx.kind).toBe("finger");
    expect(idx.X).toBeCloseTo(targetX(1) * W, 6);
    expect(idx.Y).toBeCloseTo(stringY(2) * H, 6);
    // middle → string 4, fret 2
    const mid = byFinger("middle");
    expect(mid.X).toBeCloseTo(targetX(2) * W, 6);
    expect(mid.Y).toBeCloseTo(stringY(4) * H, 6);
    // ring → string 5, fret 3
    const ring = byFinger("ring");
    expect(ring.X).toBeCloseTo(targetX(3) * W, 6);
    expect(ring.Y).toBeCloseTo(stringY(5) * H, 6);
  });

  it("matches hand-computed pixel values (regression guard)", () => {
    expect(byFinger("index").X).toBeCloseTo(200.5, 1);
    expect(byFinger("index").Y).toBeCloseTo(576, 6);
    expect(byFinger("middle").X).toBeCloseTo(475.6, 1);
    expect(byFinger("middle").Y).toBeCloseTo(288, 6);
    expect(byFinger("ring").X).toBeCloseTo(735.3, 1);
    expect(byFinger("ring").Y).toBeCloseTo(144, 6);
  });

  it("puts open expected strings (1, 3) and the avoid string (6) at the nut (x=0)", () => {
    const open = dots.filter((d) => d.kind === "open");
    expect(open.map((d) => d.string).sort()).toEqual([1, 3]);
    for (const d of open) {
      expect(d.X).toBeCloseTo(fretLineX(0) * W, 9); // nut edge → 0
      expect(d.Y).toBeCloseTo(stringY(d.string) * H, 9);
    }
    const avoid = dots.filter((d) => d.kind === "avoid");
    expect(avoid.map((d) => d.string)).toEqual([6]);
    expect(avoid[0].X).toBeCloseTo(0, 9);
    expect(avoid[0].Y).toBeCloseTo(stringY(6) * H, 9);
  });
});

describe("planTargets calibration gating", () => {
  it("no calibration → no dots, nudge flag set", () => {
    const plan = planTargets(true, null, cTarget, W, H);
    expect(plan.dots).toEqual([]);
    expect(plan.nudge).toBe(true);
  });

  it("calibrated + active → dots, no nudge", () => {
    const plan = planTargets(true, IDENTITY_HOMOGRAPHY, cTarget, W, H);
    expect(plan.dots.length).toBeGreaterThan(0);
    expect(plan.nudge).toBe(false);
  });

  it("no active lesson (or no target) → nothing, no nudge", () => {
    expect(planTargets(false, IDENTITY_HOMOGRAPHY, cTarget, W, H)).toEqual({ dots: [], nudge: false });
    expect(planTargets(true, IDENTITY_HOMOGRAPHY, null, W, H)).toEqual({ dots: [], nudge: false });
  });
});

describe("exploreDots", () => {
  const AM: ExploreTarget = {
    kind: "chord", root: "A", suffix: "minor", active: 0,
    voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
  };
  it("emits finger/open/avoid dots with number labels for the active voicing", () => {
    const dots = exploreDots(AM, IDENTITY_HOMOGRAPHY, W, H);
    expect(dots.filter((d) => d.kind === "finger")).toHaveLength(3);
    expect(dots.filter((d) => d.kind === "open")).toHaveLength(2);
    expect(dots.filter((d) => d.kind === "avoid")).toHaveLength(1);
    expect(dots.find((d) => d.string === 2)?.label).toBe("1"); // B string, finger 1
  });
  it("clamps to the calibrated window: fret > MAX_FRET dots are skipped", () => {
    const up: ExploreTarget = { ...AM, voicings: [{ ...AM.voicings[0], frets: [5, 5, 5, 7, 7, 5], window: [4, 8] }] };
    const dots = exploreDots(up, IDENTITY_HOMOGRAPHY, W, H);
    expect(dots.filter((d) => d.kind === "finger" && (d.fret ?? 0) > 5)).toHaveLength(0);
  });
  it("scale targets emit degree-labeled dots, window-clamped", () => {
    const sc: ExploreTarget = { kind: "scale", root: "G", scaleType: "major", positions: [
      { string: 6, fret: 3, midi: 43, note: "G2", degree: "1", isRoot: true },
      { string: 6, fret: 10, midi: 50, note: "D3", degree: "5", isRoot: false },
    ]};
    const dots = exploreDots(sc, IDENTITY_HOMOGRAPHY, W, H);
    expect(dots).toHaveLength(1);
    expect(dots[0].label).toBe("1");
  });
  it("null target → no dots", () => {
    expect(exploreDots(null, IDENTITY_HOMOGRAPHY, W, H)).toEqual([]);
  });
});
