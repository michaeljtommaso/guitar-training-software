import { describe, expect, it } from "vitest";
import { CocoFileSchema } from "./coco";
import { HAND_KEYPOINT_NAMES } from "./handKeypoints";

const kpFlat = HAND_KEYPOINT_NAMES.flatMap((_, i) => [0.1 * i, 0.2 * i, 2]);

const sample = {
  images: [{ id: 0, file_name: "clip-001_f0042.png", width: 1280, height: 720, frame_index: 42, t: 1.4 }],
  annotations: [
    { id: 0, image_id: 0, category_id: 1 as const, keypoints: kpFlat, num_keypoints: HAND_KEYPOINT_NAMES.length },
  ],
  categories: [{ id: 1 as const, name: "hand" as const, keypoints: [...HAND_KEYPOINT_NAMES] }],
};

describe("CocoFileSchema", () => {
  it("round-trips a sample through parse -> stringify -> parse", () => {
    const parsed = CocoFileSchema.parse(sample);
    const roundTripped = CocoFileSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(sample);
  });

  it("rejects a keypoints array with the wrong length", () => {
    const bad = { ...sample, annotations: [{ ...sample.annotations[0], keypoints: [1, 2, 3] }] };
    expect(CocoFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a category id other than 1", () => {
    const bad = { ...sample, categories: [{ ...sample.categories[0], id: 2 }] };
    expect(CocoFileSchema.safeParse(bad).success).toBe(false);
  });
});
