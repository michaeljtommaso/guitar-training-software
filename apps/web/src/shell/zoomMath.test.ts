import { describe, expect, it } from "vitest";
import { zoomCropRect, toZoomSpace, lessonTargetToVoicing, ZOOM_PAD } from "./zoomMath";
import {
  IDENTITY_HOMOGRAPHY,
  invertHomography,
  solveHomography,
  type Point,
} from "../perception/vision/homography";
import { fretLineX, stringY, MAX_FRET } from "../perception/vision/fretboard";
import { getLesson } from "../fusion/lessons";
import type { FusionTarget } from "../overlay/targetDots";

// zoomMath is the ZoomPane's pure geometry (spec §6): the fretboard quad →
// padded/clamped video-pixel crop rect, and the linear map from a video-pixel
// dot into the zoom canvas. Fixtures reuse targetDots' homography convention
// (identity + a solved affine), so the expectations are hand-computable.

describe("zoomCropRect — fretboard quad → padded, clamped video-pixel bbox", () => {
  it("identity homography spans the whole frame, then clamps the pad to the video bounds", () => {
    // Identity: the fretboard unit square maps to the full normalized image, so
    // the bbox is the entire frame and the 12%-of-height pad clamps back in.
    const crop = zoomCropRect(IDENTITY_HOMOGRAPHY, 1000, 800, ZOOM_PAD);
    expect(crop.sx).toBeCloseTo(0, 6);
    expect(crop.sy).toBeCloseTo(0, 6);
    expect(crop.sw).toBeCloseTo(1000, 6);
    expect(crop.sh).toBeCloseTo(800, 6);
  });

  it("maps a sub-rectangle board and pads by 12% of the bbox HEIGHT on every edge", () => {
    // Build Hinv (fretboard → image) as the affine that puts the board in the
    // image rect x∈[0.2,0.8], y∈[0.3,0.6]; pass its inverse H (image →
    // fretboard) as the calibration, exactly like the overlay stores it.
    const fretCorners: Point[] = [
      { x: fretLineX(0), y: stringY(1) }, // (0,1)
      { x: fretLineX(MAX_FRET), y: stringY(1) }, // (1,1)
      { x: fretLineX(0), y: stringY(6) }, // (0,0)
      { x: fretLineX(MAX_FRET), y: stringY(6) }, // (1,0)
    ];
    const imageCorners: Point[] = [
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.3 },
      { x: 0.2, y: 0.6 },
      { x: 0.8, y: 0.6 },
    ];
    const Hinv = solveHomography(fretCorners, imageCorners);
    const H = invertHomography(Hinv);

    const crop = zoomCropRect(H, 1000, 800, 0.12);
    // bbox px: x[200,800], y[240,480]; height 240; pad 0.12*240 = 28.8 all edges.
    expect(crop.sx).toBeCloseTo(171.2, 4);
    expect(crop.sy).toBeCloseTo(211.2, 4);
    expect(crop.sw).toBeCloseTo(657.6, 4);
    expect(crop.sh).toBeCloseTo(297.6, 4);
  });

  it("defaults the pad to ZOOM_PAD (12%)", () => {
    const withDefault = zoomCropRect(IDENTITY_HOMOGRAPHY, 640, 480);
    const explicit = zoomCropRect(IDENTITY_HOMOGRAPHY, 640, 480, ZOOM_PAD);
    expect(withDefault).toEqual(explicit);
    expect(ZOOM_PAD).toBeCloseTo(0.12, 6);
  });

  it("returns a zero-size crop for a singular homography rather than throwing", () => {
    const singular = [0, 0, 0, 0, 0, 0, 0, 0, 1];
    const crop = zoomCropRect(singular, 640, 480);
    expect(crop.sw).toBe(0);
    expect(crop.sh).toBe(0);
  });
});

describe("toZoomSpace — video-pixel dot → zoom-canvas pixel (linear)", () => {
  const crop = { sx: 100, sy: 200, sw: 400, sh: 300 };
  const canvas = { w: 720, h: 180 };

  it("maps the crop origin to (0,0) and the far corner to the canvas size", () => {
    expect(toZoomSpace({ X: 100, Y: 200 }, crop, canvas)).toEqual({ X: 0, Y: 0 });
    expect(toZoomSpace({ X: 500, Y: 500 }, crop, canvas)).toEqual({ X: 720, Y: 180 });
  });

  it("maps the crop centre to the canvas centre", () => {
    const p = toZoomSpace({ X: 300, Y: 350 }, crop, canvas);
    expect(p.X).toBeCloseTo(360, 6);
    expect(p.Y).toBeCloseTo(90, 6);
  });

  it("is the exact inverse composition of the crop scale (arbitrary point)", () => {
    const p = toZoomSpace({ X: 260, Y: 275 }, crop, canvas);
    expect(p.X).toBeCloseTo(((260 - 100) / 400) * 720, 6);
    expect(p.Y).toBeCloseTo(((275 - 200) / 300) * 180, 6);
  });
});

describe("lessonTargetToVoicing — lesson fingering → display voicing (fallback strip)", () => {
  const cStep = getLesson("open_chords_c_major")!.steps[0];
  const cTarget: FusionTarget = {
    fingering: cStep.accepted_fingerings[0],
    expectedStrings: cStep.expected_strings,
    avoidStrings: cStep.avoid_strings,
  };

  it("emits per-string absolute frets (index 0 = string 1) with muted avoids and open expecteds", () => {
    const target = lessonTargetToVoicing(cTarget);
    expect(target?.kind).toBe("chord");
    const v = target?.kind === "chord" ? target.voicings[target.active] : undefined;
    // C major: e(open) B(1) G(open) D(2) A(3) E(mute)
    expect(v?.frets).toEqual([0, 1, 0, 2, 3, -1]);
    expect(v?.fingers).toEqual([0, 1, 0, 2, 3, 0]);
  });

  it("windows from the nut through at least the highest fretted note", () => {
    const target = lessonTargetToVoicing(cTarget);
    const v = target?.kind === "chord" ? target.voicings[target.active] : undefined;
    expect(v?.window[0]).toBe(0);
    expect(v?.window[1]).toBeGreaterThanOrEqual(3);
  });

  it("returns null for a null target (empty schematic board)", () => {
    expect(lessonTargetToVoicing(null)).toBeNull();
  });
});
