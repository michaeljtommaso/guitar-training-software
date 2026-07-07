import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../fusion/fusionStore", () => ({ stopLesson: vi.fn() }));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4] as [number, number], difficulty: 13 },
    { frets: [5, 5, 5, 7, 7, 5], fingers: [1, 1, 1, 3, 4, 1], barres: [5], baseFret: 5, window: [4, 8] as [number, number], difficulty: 61 },
  ]),
}));

import { stopLesson } from "../fusion/fusionStore";
import { exploreHot, resolveTier, useExploreStore } from "./exploreStore";

describe("exploreStore", () => {
  beforeEach(() => {
    useExploreStore.getState().setMode("practice");
    vi.clearAllMocks();
  });
  it("entering explore stops any lesson; leaving clears the hot target", async () => {
    useExploreStore.getState().setMode("explore");
    expect(stopLesson).toHaveBeenCalledOnce();
    await useExploreStore.getState().setChord("A", "minor");
    expect(exploreHot.target?.kind).toBe("chord");
    useExploreStore.getState().setMode("practice");
    expect(exploreHot.target).toBeNull();
  });
  it("setChord loads voicings, resets active to 0; setVoicing clamps", async () => {
    useExploreStore.getState().setMode("explore");
    await useExploreStore.getState().setChord("A", "minor");
    const t = useExploreStore.getState().target;
    expect(t?.kind === "chord" && t.voicings.length).toBe(2);
    useExploreStore.getState().setVoicing(99);
    const t2 = useExploreStore.getState().target;
    expect(t2?.kind === "chord" && t2.active).toBe(1); // clamped to last
  });
  it("setScale builds positions synchronously", () => {
    useExploreStore.getState().setMode("explore");
    useExploreStore.getState().setScale("G", "major");
    const t = useExploreStore.getState().target;
    expect(t?.kind === "scale" && t.positions.length).toBeGreaterThan(20);
    expect(exploreHot.target).toBe(t);
  });
  it("resolveTier: auto keys off input classification", () => {
    expect(resolveTier("auto", "Scarlett 2i2 USB")).toBe("full");
    expect(resolveTier("auto", "Built-in Microphone Array")).toBe("light");
    expect(resolveTier("light", "Scarlett 2i2 USB")).toBe("light");
    expect(resolveTier("full", "whatever")).toBe("full");
  });
});
