import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
import { useExploreStore } from "./exploreStore";

describe("ExplorePanel", () => {
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
  it("scale kind renders positions without any async load", () => {
    render(<ExplorePanel />);
    useExploreStore.getState().setMode("explore");
    fireEvent.click(screen.getByTestId("explore-kind-scale"));
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "G" } });
    expect(screen.getByTestId("fretboard-strip")).toBeTruthy();
  });
});
