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
  /** Open strings passed in the setup check this session (0-6, never persisted). */
  openStringsSeen: number;
  setDevices(lists: DeviceLists): void;
  select(patch: Partial<Pick<CaptureState, "cameraId" | "micId">>): void;
  setPhase(phase: CapturePhase, error?: string | null): void;
  setInputMeta(m: InputMeta | null): void;
  setOpenStringsSeen(n: number): void;
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
      openStringsSeen: 0,
      setDevices: (lists) => set({ cameras: lists.cameras, mics: lists.mics }),
      select: (patch) => set(patch),
      setPhase: (phase, error = null) => set({ phase, error }),
      setInputMeta: (m) => set({ inputMeta: m }),
      setOpenStringsSeen: (n) => set({ openStringsSeen: n }),
    }),
    { name: "gt-capture-devices", partialize: (s) => ({ cameraId: s.cameraId, micId: s.micId }) },
  ),
);

/** Input metadata for the running capture, or null. Read by fusionStore. */
export const getInputMeta = (): InputMeta | null => useCaptureStore.getState().inputMeta;

/** Open strings passed the setup check this session (0-6). Read by fusionStore. */
export const getOpenStringsSeen = (): number => useCaptureStore.getState().openStringsSeen;
