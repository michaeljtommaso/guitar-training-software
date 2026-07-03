// The 21 MediaPipe HandLandmarker keypoint names (Apache-2.0, ADR-006), in
// landmark-index order. Shared by the COCO-style keypoints schema (coco.ts)
// so vision annotations line up 1:1 with what HandLandmarker emits at
// inference time. See https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
export const HAND_KEYPOINT_NAMES = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_finger_mcp",
  "index_finger_pip",
  "index_finger_dip",
  "index_finger_tip",
  "middle_finger_mcp",
  "middle_finger_pip",
  "middle_finger_dip",
  "middle_finger_tip",
  "ring_finger_mcp",
  "ring_finger_pip",
  "ring_finger_dip",
  "ring_finger_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
] as const;

/** Indices of the 5 fingertip keypoints within HAND_KEYPOINT_NAMES — the ones
 *  the fretting/annotation UI cares about most (thumb_tip..pinky_tip). */
export const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const;
