import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// App is a thin wrapper around AppShell; stub the heavy child components so
// this smoke test stays fast. Full shell behavior lives in AppShell.test.tsx.
vi.mock("./capture/SetupWizard", () => ({
  SetupWizard: () => <div data-testid="setup-wizard" />,
}));
vi.mock("./coach", () => ({
  CoachPanel: () => <div data-testid="coach-panel" />,
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
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Guitar tutor")).toBeInTheDocument();
  });

  it("defaults to dark theme and flips data-theme on toggle (spec §1.4)", () => {
    render(<App />);
    // v2 default is dark on first load.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    const toggle = screen.getByRole("button", { name: /switch to/i });
    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();

    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
