import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { useClipStore } from "./store/clipStore";

describe("App", () => {
  beforeEach(() => {
    useClipStore.setState({
      clipId: null,
      annotator: "",
      fps: 30,
      quad: null,
      fingerAssignments: [],
      tags: [],
      consent: { given: false, scope: "", date: "" },
      queue: [],
      lastReceipt: null,
    });
  });

  it("renders the shell with all major panels before any clip is loaded", () => {
    render(<App />);
    expect(screen.getByText("Guitar tutor — annotation tool")).toBeInTheDocument();
    expect(screen.getByText("Fingertip assignment")).toBeInTheDocument();
    expect(screen.getByText("Mistake tags")).toBeInTheDocument();
    expect(screen.getByText("Consent")).toBeInTheDocument();
    expect(screen.getByText("Active-learning queue")).toBeInTheDocument();
    expect(screen.getByText("Export / import")).toBeInTheDocument();
  });

  it("does not render the quad overlay until a video is loaded (no quad yet)", () => {
    render(<App />);
    expect(document.querySelector(".quad-overlay")).toBeNull();
  });
});
