// Locks TP-2 Task 11 behavior: applyPreset sets params+preset name, unknown
// preset is a no-op, manual set() clears preset back to null.
import { beforeEach, describe, expect, it } from "vitest";
import { useToneStore } from "./toneStore";
import { DEFAULT_TONE } from "./toneChain";

describe("useToneStore.applyPreset", () => {
  beforeEach(() => {
    useToneStore.setState({ params: DEFAULT_TONE, preset: null });
  });

  it("applies a known preset by name", () => {
    useToneStore.getState().applyPreset("Crunch Rhythm");
    const s = useToneStore.getState();
    expect(s.params.drive).toBe(0.45);
    expect(s.preset).toBe("Crunch Rhythm");
  });

  it("is a no-op for an unknown preset name", () => {
    useToneStore.getState().applyPreset("Nonexistent Preset");
    const s = useToneStore.getState();
    expect(s.params).toEqual(DEFAULT_TONE);
    expect(s.preset).toBeNull();
  });

  it("clears preset to null on a manual set()", () => {
    useToneStore.getState().applyPreset("Crunch Rhythm");
    useToneStore.getState().set({ drive: 0.5 });
    const s = useToneStore.getState();
    expect(s.params.drive).toBe(0.5);
    expect(s.preset).toBeNull();
  });
});
