// Everything saves to local JSON files (download/upload — no backend, per
// WP-6 scope). Three export shapes: taxonomy.json (the tool's own session
// state — mistakes, consent, quad, finger assignments), jams.json (mistake
// ranges reframed as JAMS-style time/duration/value/confidence observations),
// coco.json (finger-click pixel positions as a sparse COCO hand-keypoints
// set — only the fingertip indices we actually clicked are labeled; the
// other 16 of 21 keypoints stay v=0/"not labeled", honestly reflecting that
// this tool captures fingertip clicks, not full 21-point hand pose).
import { CocoFileSchema, type CocoFile } from "../schemas/coco";
import { FINGERTIP_INDICES, HAND_KEYPOINT_NAMES } from "../schemas/handKeypoints";
import { JamsFileSchema, type JamsFile } from "../schemas/jams";
import { TaxonomyFileSchema, type TaxonomyFile } from "../schemas/taxonomy";

export interface ExportableClipState {
  clipId: string;
  annotator: string;
  consent: TaxonomyFile["consent"];
  quad: TaxonomyFile["quad"];
  fingerAssignments: TaxonomyFile["fingerAssignments"];
  tags: TaxonomyFile["tags"];
}

const FINGER_TO_TIP_INDEX: Record<string, number> = {
  thumb: FINGERTIP_INDICES[0],
  index: FINGERTIP_INDICES[1],
  middle: FINGERTIP_INDICES[2],
  ring: FINGERTIP_INDICES[3],
  pinky: FINGERTIP_INDICES[4],
};

export function buildTaxonomyFile(state: ExportableClipState, now: () => Date = () => new Date()): TaxonomyFile {
  return TaxonomyFileSchema.parse({
    clipId: state.clipId,
    annotator: state.annotator,
    createdAt: now().toISOString(),
    consent: state.consent,
    quad: state.quad,
    fingerAssignments: state.fingerAssignments,
    tags: state.tags,
  });
}

export function buildJamsFile(state: ExportableClipState, duration: number): JamsFile {
  return JamsFileSchema.parse({
    file_metadata: { clipId: state.clipId, duration },
    annotations: [
      {
        namespace: "mistake_taxonomy",
        data: state.tags.map((t) => ({
          time: t.start,
          duration: Math.max(0, t.end - t.start),
          value: t.code,
          confidence: null,
        })),
      },
    ],
  });
}

export function buildCocoFile(
  state: ExportableClipState,
  video: { width: number; height: number; fps: number },
): CocoFile {
  const frames = [...new Set(state.fingerAssignments.map((a) => a.frame))].sort((a, b) => a - b);
  const images = frames.map((frame, i) => ({
    id: i,
    file_name: `${state.clipId}_f${String(frame).padStart(6, "0")}.png`,
    width: video.width,
    height: video.height,
    frame_index: frame,
    t: frame / video.fps,
  }));
  const frameToImageId = new Map(frames.map((f, i) => [f, i]));

  const annotations = frames.map((frame, i) => {
    const keypoints = new Array(HAND_KEYPOINT_NAMES.length * 3).fill(0);
    let labeled = 0;
    for (const a of state.fingerAssignments) {
      if (a.frame !== frame || a.px === undefined || a.py === undefined) continue;
      const kpIndex = FINGER_TO_TIP_INDEX[a.finger];
      keypoints[kpIndex * 3] = a.px;
      keypoints[kpIndex * 3 + 1] = a.py;
      keypoints[kpIndex * 3 + 2] = 2; // labeled + visible
      labeled++;
    }
    return {
      id: i,
      image_id: frameToImageId.get(frame)!,
      category_id: 1 as const,
      keypoints,
      num_keypoints: labeled,
    };
  });

  return CocoFileSchema.parse({
    images,
    annotations,
    categories: [{ id: 1 as const, name: "hand" as const, keypoints: [...HAND_KEYPOINT_NAMES] }],
  });
}

/** Triggers a browser download of `obj` as pretty-printed JSON. Browser-only
 *  (Blob + object URL); not unit tested — see decodeVideoAudio.ts's note. */
export function downloadJson(filename: string, obj: unknown): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}
