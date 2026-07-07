import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../theory/chords", async (orig) => ({
  ...(await orig()),
  chordVoicings: vi.fn(async () => [
    { frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 },
    { frets: [5, 5, 5, 7, 7, 5], fingers: [1, 1, 1, 3, 4, 1], barres: [5], baseFret: 5, window: [4, 8], difficulty: 61 },
  ]),
  chordSuffixes: vi.fn(async () => ["major", "minor"]),
}));

import { CoachColumn } from "./CoachColumn";
import { useExploreStore } from "../explore/exploreStore";
import { useCoachStore } from "../coach/coachStore";
import { chordVoicings } from "../theory/chords";

describe("CoachColumn — practice mode (coach chat)", () => {
  beforeEach(() => {
    useExploreStore.getState().setMode("practice");
    useCoachStore.setState({ localOnly: true, hydrated: false });
  });
  afterEach(() => {
    useExploreStore.getState().setMode("practice");
  });

  it("renders the coach header, local-only toggle (default checked), and summary", () => {
    render(<CoachColumn />);
    expect(screen.getByTestId("coach-column")).toBeInTheDocument();
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(screen.getByTestId("coach-local-only")).toBeChecked();
    expect(screen.getByTestId("coach-summary")).toHaveTextContent(/play a chord/i);
  });

  it("asking a question in local-only mode answers on-device with zero network (byte-identical to CoachPanel)", async () => {
    render(<CoachColumn />);
    fireEvent.change(screen.getByLabelText("Question for the coach"), {
      target: { value: "why does my C sound muffled?" },
    });
    fireEvent.click(screen.getByTestId("coach-ask"));

    await waitFor(() => expect(screen.getByTestId("coach-reply")).toBeInTheDocument());
    expect(screen.getByTestId("coach-source")).toHaveTextContent(/on-device/i);
  });

  it("does not render explore controls in practice mode", () => {
    render(<CoachColumn />);
    expect(screen.queryByTestId("explore-root")).not.toBeInTheDocument();
  });
});

describe("CoachColumn — explore mode (existing ExplorePanel controls)", () => {
  beforeEach(() => {
    useExploreStore.setState({ target: null });
    useExploreStore.getState().setMode("explore");
  });
  afterEach(() => {
    useExploreStore.getState().setMode("practice");
  });

  it("renders the existing explore testids (kind/root/suffix/tier) without forking ExplorePanel", async () => {
    render(<CoachColumn />);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByTestId("explore-kind-chord")).toBeInTheDocument();
    expect(screen.getByTestId("explore-kind-scale")).toBeInTheDocument();
    expect(screen.getByTestId("explore-root")).toBeInTheDocument();
    expect(screen.getByTestId("explore-suffix")).toBeInTheDocument();
    expect(screen.getByTestId("explore-tier")).toBeInTheDocument();
  });

  it("does not mount the coach chat while in explore mode", () => {
    render(<CoachColumn />);
    expect(screen.queryByTestId("coach-ask")).not.toBeInTheDocument();
  });

  it("does NOT render the fretboard strip — that lives in the ZoomPane slot, not the coach column", async () => {
    render(<CoachColumn />);
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    fireEvent.change(screen.getByTestId("explore-suffix"), { target: { value: "minor" } });
    await waitFor(() => expect(screen.getByTestId("explore-voicing-label")).toBeInTheDocument());
    expect(screen.queryByTestId("fretboard-strip")).not.toBeInTheDocument();
  });

  it("voicing pager steps through the real store voicings (1/2 → 2/2) — migrated from ExplorePanel.test", async () => {
    render(<CoachColumn />);
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    fireEvent.change(screen.getByTestId("explore-suffix"), { target: { value: "minor" } });
    await waitFor(() => expect(screen.getByTestId("explore-voicing-label")).toHaveTextContent("1/2"));
    fireEvent.click(screen.getByTestId("explore-voicing-next"));
    expect(screen.getByTestId("explore-voicing-label")).toHaveTextContent("2/2");
  });

  it("empty voicing list shows the no-voicings message instead of the pager (spec §8) — migrated from ExplorePanel.test", async () => {
    vi.mocked(chordVoicings).mockResolvedValueOnce([]);
    render(<CoachColumn />);
    fireEvent.change(screen.getByTestId("explore-root"), { target: { value: "A" } });
    await waitFor(() => expect(screen.getByTestId("explore-no-voicings")).toBeInTheDocument());
    expect(screen.getByTestId("explore-no-voicings")).toHaveTextContent("no voicings");
    expect(screen.queryByTestId("explore-voicing-label")).toBeNull();
  });

  it("switching mode swaps the column content reactively", () => {
    const { rerender } = render(<CoachColumn />);
    expect(screen.getByTestId("explore-root")).toBeInTheDocument();
    useExploreStore.getState().setMode("practice");
    rerender(<CoachColumn />);
    expect(screen.queryByTestId("explore-root")).not.toBeInTheDocument();
    expect(screen.getByTestId("coach-ask")).toBeInTheDocument();
  });
});
