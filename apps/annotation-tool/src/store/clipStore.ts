// Central annotation-session state for one loaded clip (Zustand — matches
// apps/web's captureStore.ts pattern). Everything here maps directly onto
// TaxonomyFileSchema (schemas/taxonomy.ts) for export.
import { create } from "zustand";
import type { Consent, FingerAssignment, QuadCorners, TagRange } from "../schemas/taxonomy";
import type { DiagnosisCode } from "../shared/diagnosis";

/** One row of an imported active-learning queue (model output to be reviewed). */
export interface QueueItem {
  clipId: string;
  t: number;
  code: string;
  conf: number;
}

/** Receipt proving a clip's annotation data was deleted from the working set. */
export interface DeletionReceipt {
  clipId: string;
  deletedBy: string;
  deletedAt: string;
  itemsRemoved: { fingerAssignments: number; tags: number };
}

export function buildDeletionReceipt(
  clipId: string,
  deletedBy: string,
  itemsRemoved: DeletionReceipt["itemsRemoved"],
  now: () => Date = () => new Date(),
): DeletionReceipt {
  return { clipId, deletedBy, deletedAt: now().toISOString(), itemsRemoved };
}

/** Sort ascending by confidence — most uncertain (lowest conf) first. */
export function rankByUncertainty(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.conf - b.conf);
}

interface ClipState {
  clipId: string | null;
  annotator: string;
  fps: number;
  quad: QuadCorners | null;
  fingerAssignments: FingerAssignment[];
  tags: TagRange[];
  consent: Consent;
  queue: QueueItem[];
  lastReceipt: DeletionReceipt | null;

  loadClip(clipId: string, fps?: number): void;
  setAnnotator(name: string): void;
  setFps(fps: number): void;
  setQuad(quad: QuadCorners): void;
  addFingerAssignment(a: FingerAssignment): void;
  removeFingerAssignment(index: number): void;
  addTag(t: { start: number; end: number; code: DiagnosisCode; note?: string }): void;
  removeTag(index: number): void;
  setConsent(c: Consent): void;
  importQueue(items: QueueItem[]): void;
  deleteClipData(): void;
}

const emptyConsent: Consent = { given: false, scope: "", date: "" };

export const useClipStore = create<ClipState>((set, get) => ({
  clipId: null,
  annotator: "",
  fps: 30,
  quad: null,
  fingerAssignments: [],
  tags: [],
  consent: emptyConsent,
  queue: [],
  lastReceipt: null,

  loadClip: (clipId, fps = 30) =>
    set({
      clipId,
      fps,
      quad: null,
      fingerAssignments: [],
      tags: [],
      consent: emptyConsent,
      lastReceipt: null,
    }),
  setAnnotator: (name) => set({ annotator: name }),
  setFps: (fps) => set({ fps }),
  setQuad: (quad) => set({ quad }),
  addFingerAssignment: (a) => set((s) => ({ fingerAssignments: [...s.fingerAssignments, a] })),
  removeFingerAssignment: (index) =>
    set((s) => ({ fingerAssignments: s.fingerAssignments.filter((_, i) => i !== index) })),
  addTag: (t) => set((s) => ({ tags: [...s.tags, t] })),
  removeTag: (index) => set((s) => ({ tags: s.tags.filter((_, i) => i !== index) })),
  setConsent: (c) => set({ consent: c }),
  importQueue: (items) => set({ queue: rankByUncertainty(items) }),
  deleteClipData: () => {
    const s = get();
    if (!s.clipId) return;
    const receipt = buildDeletionReceipt(s.clipId, s.annotator || "unknown", {
      fingerAssignments: s.fingerAssignments.length,
      tags: s.tags.length,
    });
    set({ fingerAssignments: [], tags: [], quad: null, consent: emptyConsent, lastReceipt: receipt });
  },
}));
