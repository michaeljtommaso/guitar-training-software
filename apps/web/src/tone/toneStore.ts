// Coarse tone-knob state (UI cadence). The controller subscribes and pushes
// params into the running chain; TonePanel and lesson presets write here.
import { create } from "zustand";
import { DEFAULT_TONE, type MonitorMode, type ToneParams } from "./toneChain";
import { TONE_PRESETS } from "./presets";

interface ToneState {
  params: ToneParams;
  preset: string | null;
  set(patch: Partial<ToneParams>): void;
  applyPreset(name: string): void;
}

export const useToneStore = create<ToneState>((set) => ({
  params: DEFAULT_TONE,
  preset: null,
  set: (patch) => set((s) => ({ params: { ...s.params, ...patch }, preset: null })),
  applyPreset: (name) => {
    const p = TONE_PRESETS[name];
    if (p) set({ params: p, preset: name });
  },
}));

export const getToneMeta = (): { preset: string | null; monitor: MonitorMode } => {
  const s = useToneStore.getState();
  return { preset: s.preset, monitor: s.params.monitor };
};
