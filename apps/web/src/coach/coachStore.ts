// Coach UI state (Zustand, ADR-002). The one load-bearing setting is
// Local-only mode, DEFAULT ON (privacy-first, §15): when on, the coach makes
// ZERO network calls. The flag is persisted in Dexie settings and rehydrated
// on load.
import { create } from "zustand";
import { getSetting, setSetting } from "./settingsDb";

const LOCAL_ONLY_KEY = "coach.localOnly";

export interface CoachStore {
  /** Local-only mode. DEFAULT ON — the app starts private, opt-in to network. */
  localOnly: boolean;
  /** true once the persisted value has been read back from Dexie. */
  hydrated: boolean;
  setLocalOnly: (value: boolean) => void;
  toggleLocalOnly: () => void;
  hydrate: () => Promise<void>;
}

export const useCoachStore = create<CoachStore>((set, get) => ({
  localOnly: true, // privacy-first default — before hydration too
  hydrated: false,
  setLocalOnly: (value) => {
    set({ localOnly: value });
    void setSetting(LOCAL_ONLY_KEY, value ? "1" : "0");
  },
  toggleLocalOnly: () => get().setLocalOnly(!get().localOnly),
  hydrate: async () => {
    const stored = await getSetting(LOCAL_ONLY_KEY);
    // Only "0" (explicit opt-out) turns it off; anything else stays ON.
    set({ localOnly: stored !== "0", hydrated: true });
  },
}));
