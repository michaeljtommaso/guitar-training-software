import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { useCoachStore } from "./coachStore";
import { getSetting, setSetting } from "./settingsDb";

async function eventually<T>(fn: () => Promise<T | undefined>, want: T): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if ((await fn()) === want) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`setting never became ${String(want)}`);
}

describe("coach store — Local-only mode, default ON", () => {
  beforeEach(() => useCoachStore.setState({ localOnly: true, hydrated: false }));

  it("defaults local-only ON (privacy-first)", () => {
    expect(useCoachStore.getState().localOnly).toBe(true);
  });

  it("toggle flips the flag synchronously", () => {
    useCoachStore.getState().toggleLocalOnly();
    expect(useCoachStore.getState().localOnly).toBe(false);
    useCoachStore.getState().toggleLocalOnly();
    expect(useCoachStore.getState().localOnly).toBe(true);
  });

  it("persists the toggle to Dexie", async () => {
    useCoachStore.getState().setLocalOnly(false);
    await eventually(() => getSetting("coach.localOnly"), "0");
  });

  it("hydrates the persisted value from Dexie", async () => {
    await setSetting("coach.localOnly", "0");
    await useCoachStore.getState().hydrate();
    expect(useCoachStore.getState().localOnly).toBe(false);
    expect(useCoachStore.getState().hydrated).toBe(true);

    await setSetting("coach.localOnly", "1");
    await useCoachStore.getState().hydrate();
    expect(useCoachStore.getState().localOnly).toBe(true);
  });
});
