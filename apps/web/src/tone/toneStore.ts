// Coarse tone-knob state (UI cadence). The controller subscribes and pushes
// params into the running chain; TonePanel and lesson presets write here.
import { create } from "zustand";
import { DEFAULT_TONE, type MonitorMode, type ToneParams } from "./toneChain";
import { TONE_PRESETS } from "./presets";

interface ToneState {
  params: ToneParams;
  preset: string | null;
  set(patch: Partial<ToneParams>): void;
  /** Apply a preset by name. `preserveMonitor` keeps the current monitor mode
   *  (lessons must not force audio on) while applying every other knob. */
  applyPreset(name: string, opts?: { preserveMonitor?: boolean }): void;
}

export const useToneStore = create<ToneState>((set) => ({
  params: DEFAULT_TONE,
  preset: null,
  set: (patch) => set((s) => ({ params: { ...s.params, ...patch }, preset: null })),
  applyPreset: (name, opts) => {
    const p = TONE_PRESETS[name];
    if (!p) return;
    set((s) => ({
      params: opts?.preserveMonitor ? { ...p, monitor: s.params.monitor } : p,
      preset: name,
    }));
  },
}));

export const getToneMeta = (): { preset: string | null; monitor: MonitorMode } => {
  const s = useToneStore.getState();
  return { preset: s.preset, monitor: s.params.monitor };
};
