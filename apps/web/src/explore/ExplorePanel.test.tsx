import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../fusion/fusionStore", () => ({ stopLesson: vi.fn() }));
vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 },
    { frets: [5, 5, 5, 7, 7, 5], fingers: [1, 1, 1, 3, 4, 1], barres: [5], baseFret: 5, window: [4, 8], difficulty: 61 },
  ]),
  chordSuffixes: vi.fn(async () => ["major", "minor", "7"]),
}));

import { ExplorePanel } from "./ExplorePanel";
import { exploreHot, useExploreStore } from "./exploreStore";

describe("ExplorePanel", () => {
  beforeEach(() => {
    useExploreStore.getState().setMode("practice");
    exploreHot.heard = { chordHeard: false };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("picking a chord renders the strip with dots and a voicing pager", async () => {
    render(<ExplorePanel />);
    useExploreStore.getState().setMode("explore");
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    fireEvent.change(screen.getByTestId("explore-suffix"), { target: { value: "minor" } });
    await waitFor(() => expect(screen.getByTestId("fretboard-strip")).toBeTruthy());
    expect(screen.getByTestId("explore-voicing-label").textContent).toContain("1/2");
    fireEvent.click(screen.getByTestId("explore-voicing-next"));
    expect(screen.getByTestId("explore-voicing-label").textContent).toContain("2/2");
  });
  it("rAF loop feeds exploreHot.heard into the strip (ticks appear)", async () => {
    // Deterministic rAF: callbacks queue up and only run when we flush.
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { container } = render(<ExplorePanel />);
    act(() => useExploreStore.getState().setMode("explore"));
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    fireEvent.change(screen.getByTestId("explore-suffix"), { target: { value: "minor" } });
    await waitFor(() => expect(screen.getByTestId("fretboard-strip")).toBeTruthy());

    exploreHot.heard = {
      chordHeard: true,
      strings: ["ok", "ok", "pending", "pending", "ok", "muted-expected"],
    };
    act(() => {
      rafQueue.splice(0).forEach((cb) => cb(16));
    });
    expect(container.querySelectorAll("[data-tick='ok']")).toHaveLength(3);
    expect(container.querySelector(".fret-strip")?.getAttribute("class")).toContain("heard");
  });
  it("scale kind renders positions without any async load", () => {
    render(<ExplorePanel />);
    useExploreStore.getState().setMode("explore");
    fireEvent.click(screen.getByTestId("explore-kind-scale"));
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "G" } });
    expect(screen.getByTestId("fretboard-strip")).toBeTruthy();
  });
});
