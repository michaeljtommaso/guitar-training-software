// Explore-mode state. Coarse UI state in zustand (captureStore pattern);
// exploreHot is the module-level mutable snapshot the overlay frame loop reads
// without React (ADR-002 discipline, same as fusionHot). Explore NEVER feeds
// the fusion engine — entering explore stops any active lesson instead.
import { create } from "zustand";
import { classifyAudioInput } from "../capture/devices";
import { useCaptureStore } from "../capture/captureStore";
import { stopLesson } from "../fusion/fusionStore";
import { scalePositions, type ScalePosition, type ScaleType } from "../theory/scales";
import { chordVoicings, type Voicing } from "../theory/chords";
import type { HeardState } from "./feedback";

export type ExploreTarget =
  | { kind: "chord"; root: string; suffix: string; voicings: Voicing[]; active: number }
  | { kind: "scale"; root: string; scaleType: ScaleType; positions: ScalePosition[] }
  | null;

export type FeedbackTier = "auto" | "light" | "full";

export const exploreHot: { target: ExploreTarget; heard: HeardState } = {
  target: null,
  heard: { chordHeard: false },
};

/** Pure tier resolution: auto → full only on a classified direct-input device. */
export function resolveTier(tier: FeedbackTier, micLabel: string): "light" | "full" {
  if (tier !== "auto") return tier;
  return classifyAudioInput(micLabel) === "interface" ? "full" : "light";
}

/** Monotonic setChord request id. chordVoicings() is async (lazy chords-db
 *  chunk): a request that resolves after a newer pick — or after leaving
 *  explore mode — must not write exploreHot/store state, or a late load would
 *  paint explore dots over the practice view (spec §4: practice and explore
 *  targets are never live simultaneously). setScale/setVoicing are fully
 *  synchronous and need no guard. */
let chordRequestId = 0;

interface ExploreState {
  mode: "practice" | "explore";
  target: ExploreTarget;
  tier: FeedbackTier;
  loadError: string | null;
  setMode(m: "practice" | "explore"): void;
  setChord(root: string, suffix: string): Promise<void>;
  setScale(root: string, scaleType: ScaleType): void;
  setVoicing(i: number): void;
  setTier(t: FeedbackTier): void;
}

export const useExploreStore = create<ExploreState>()((set, get) => ({
  mode: "practice",
  target: null,
  tier: "auto",
  loadError: null,
  setMode(mode) {
    if (mode === "explore" && get().mode !== "explore") stopLesson();
    if (mode === "practice") exploreHot.target = null;
    set({ mode, ...(mode === "practice" ? { target: null } : null) });
  },
  async setChord(root, suffix) {
    const req = ++chordRequestId;
    // Post-await guard: still the latest request AND still in explore mode.
    const fresh = () => req === chordRequestId && get().mode === "explore";
    try {
      const voicings = await chordVoicings(root, suffix);
      if (!fresh()) return;
      const target: ExploreTarget = { kind: "chord", root, suffix, voicings, active: 0 };
      exploreHot.target = target;
      set({ target, loadError: null });
    } catch (err) {
      if (!fresh()) return;
      set({ loadError: `chord library unavailable — ${String(err)}` });
    }
  },
  setScale(root, scaleType) {
    const target: ExploreTarget = { kind: "scale", root, scaleType, positions: scalePositions(root, scaleType) };
    exploreHot.target = target;
    set({ target, loadError: null });
  },
  setVoicing(i) {
    const t = get().target;
    if (t?.kind !== "chord" || !t.voicings.length) return;
    const active = Math.min(Math.max(i, 0), t.voicings.length - 1);
    const target = { ...t, active };
    exploreHot.target = target;
    set({ target });
  },
  setTier(tier) {
    set({ tier });
  },
}));

/** Resolved tier against the CURRENT capture mic (UI + feedback both use this). */
export function currentResolvedTier(): "light" | "full" {
  const { mics, micId } = useCaptureStore.getState();
  const label = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  return resolveTier(useExploreStore.getState().tier, label);
}
