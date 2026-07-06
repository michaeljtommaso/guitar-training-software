// Coarse wizard/UI state only (Zustand). Per-frame perception state lives in
// src/perception/perceptionStore.ts and never flows through React (ADR-002).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeviceLists } from "./devices";
import type { InputMeta } from "../fusion/sessionLog";

export type CapturePhase = "idle" | "starting" | "running" | "error";

interface CaptureState {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  cameraId: string;
  micId: string;
  phase: CapturePhase;
  error: string | null;
  /** Per-session runtime metadata for the active input (never persisted). */
  inputMeta: InputMeta | null;
  setDevices(lists: DeviceLists): void;
  select(patch: Partial<Pick<CaptureState, "cameraId" | "micId">>): void;
  setPhase(phase: CapturePhase, error?: string | null): void;
  setInputMeta(m: InputMeta | null): void;
}

export const useCaptureStore = create<CaptureState>()(
  persist(
    (set) => ({
      cameras: [],
      mics: [],
      cameraId: "",
      micId: "",
      phase: "idle",
      error: null,
      inputMeta: null,
      setDevices: (lists) => set({ cameras: lists.cameras, mics: lists.mics }),
      select: (patch) => set(patch),
      setPhase: (phase, error = null) => set({ phase, error }),
      setInputMeta: (m) => set({ inputMeta: m }),
    }),
    { name: "gt-capture-devices", partialize: (s) => ({ cameraId: s.cameraId, micId: s.micId }) },
  ),
);

/** Input metadata for the running capture, or null. Read by fusionStore. */
export const getInputMeta = (): InputMeta | null => useCaptureStore.getState().inputMeta;
