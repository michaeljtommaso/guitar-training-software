// COCO-style keypoints schema for vision annotations (§13: "COCO-style
// keypoints JSON for vision"). Standard COCO keypoint-detection shape
// (images / annotations / categories arrays; keypoints flattened
// [x0,y0,v0, x1,y1,v1, ...] per COCO's visibility-flag convention: v=0 not
// labeled, v=1 labeled-not-visible, v=2 labeled-and-visible) specialized to
// the 21 MediaPipe hand keypoints + fingertip labels.
import { z } from "zod";
import { HAND_KEYPOINT_NAMES } from "./handKeypoints";

export const CocoImageSchema = z.object({
  id: z.number().int().min(0),
  file_name: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  frame_index: z.number().int().min(0),
  t: z.number().min(0), // seconds, synced to the clip's video/audio clock
});

const NUM_KP = HAND_KEYPOINT_NAMES.length;

export const CocoAnnotationSchema = z.object({
  id: z.number().int().min(0),
  image_id: z.number().int().min(0),
  category_id: z.literal(1), // 1 = "hand" (see categories below)
  // Flattened [x,y,v] * 21 keypoints, COCO convention.
  keypoints: z.array(z.number()).length(NUM_KP * 3),
  num_keypoints: z.number().int().min(0).max(NUM_KP),
});

export const CocoCategorySchema = z.object({
  id: z.literal(1),
  name: z.literal("hand"),
  keypoints: z.array(z.string()).length(NUM_KP),
});

export const CocoFileSchema = z.object({
  images: z.array(CocoImageSchema),
  annotations: z.array(CocoAnnotationSchema),
  categories: z.array(CocoCategorySchema).length(1),
});
export type CocoFile = z.infer<typeof CocoFileSchema>;
