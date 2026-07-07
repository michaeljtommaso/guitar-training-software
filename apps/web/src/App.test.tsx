import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// App is a thin wrapper around AppShell; stub the capture boundary so this
// smoke test stays fast. Full shell behavior lives in AppShell.test.tsx.
vi.mock("./capture/controller", () => ({
  startCapture: vi.fn(),
  MANUAL_TAP_ORDER: [],
}));
vi.mock("./overlay/OverlayCanvas", () => ({
  OverlayCanvas: () => <div data-testid="overlay-canvas-stub" />,
}));

import App from "./App";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("App", () => {
  it("renders the wizard (with the app title) on first run", () => {
    render(<App />);
    expect(screen.getByText("Guitar tutor")).toBeInTheDocument();
    expect(screen.getByTestId("wizard")).toBeInTheDocument();
  });

  it("defaults to dark theme on first load (spec §1.4)", () => {
    render(<App />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("renders the practice screen once setup is done", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<App />);
    expect(screen.getByTestId("practice-screen")).toBeInTheDocument();
  });
});
