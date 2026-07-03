import { describe, expect, it } from "vitest";
import { CocoFileSchema } from "../schemas/coco";
import { JamsFileSchema } from "../schemas/jams";
import { TaxonomyFileSchema } from "../schemas/taxonomy";
import { buildCocoFile, buildJamsFile, buildTaxonomyFile, type ExportableClipState } from "./exportImport";

const state: ExportableClipState = {
  clipId: "clip-001",
  annotator: "mikey",
  consent: { given: true, scope: "internal-training-only", date: "2026-07-03" },
  quad: [
    [100, 50],
    [900, 60],
    [920, 500],
    [90, 490],
  ],
  fingerAssignments: [
    { frame: 10, t: 0.33, finger: "index", string: 2, fret: 1, px: 420, py: 260 },
    { frame: 10, t: 0.33, finger: "middle", string: 4, fret: 2 }, // no pixel — should stay unlabeled in COCO
  ],
  tags: [{ start: 0.3, end: 0.6, code: "wrong_fret", note: "landed on fret 2" }],
};

describe("buildTaxonomyFile", () => {
  it("produces a file that validates against TaxonomyFileSchema", () => {
    const file = buildTaxonomyFile(state, () => new Date("2026-07-03T00:00:00.000Z"));
    expect(TaxonomyFileSchema.safeParse(file).success).toBe(true);
    expect(file.createdAt).toBe("2026-07-03T00:00:00.000Z");
  });
});

describe("buildJamsFile", () => {
  it("reframes mistake tags as JAMS-style time/duration/value observations", () => {
    const file = buildJamsFile(state, 12.5);
    expect(JamsFileSchema.safeParse(file).success).toBe(true);
    expect(file.annotations[0].data).toEqual([
      { time: 0.3, duration: 0.3, value: "wrong_fret", confidence: null },
    ]);
  });
});

describe("buildCocoFile", () => {
  it("labels only the fingertip keypoints that have a recorded pixel position", () => {
    const file = buildCocoFile(state, { width: 1280, height: 720, fps: 30 });
    expect(CocoFileSchema.safeParse(file).success).toBe(true);
    expect(file.images).toHaveLength(1);
    expect(file.images[0].frame_index).toBe(10);
    // index_finger_tip is keypoint index 8 -> flat offset 24,25,26.
    expect(file.annotations[0].keypoints.slice(24, 27)).toEqual([420, 260, 2]);
    expect(file.annotations[0].num_keypoints).toBe(1); // middle has no px/py -> not counted
  });

  it("emits no images when there are no finger assignments", () => {
    const file = buildCocoFile({ ...state, fingerAssignments: [] }, { width: 1280, height: 720, fps: 30 });
    expect(file.images).toEqual([]);
    expect(file.annotations).toEqual([]);
  });
});
