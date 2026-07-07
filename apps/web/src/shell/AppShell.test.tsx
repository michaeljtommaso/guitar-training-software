import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The shell mounts the existing SetupWizard + CoachPanel. Those pull in the
// capture/perception stacks; stub them so this suite stays a fast, focused
// routing/theme test (behavior of the real components is covered elsewhere).
vi.mock("../capture/SetupWizard", () => ({
  SetupWizard: () => <div data-testid="setup-wizard" />,
}));
vi.mock("../coach", () => ({
  CoachPanel: () => <div data-testid="coach-panel" />,
}));

import { AppShell } from "./AppShell";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("AppShell — routing (gt-setup-done)", () => {
  it("renders the wizard route when setup is NOT done", () => {
    render(<AppShell />);
    expect(screen.getByTestId("route-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("route-practice")).not.toBeInTheDocument();
  });

  it("renders the practice route when setup IS done", () => {
    localStorage.setItem("gt-setup-done", "true");
    render(<AppShell />);
    expect(screen.getByTestId("route-practice")).toBeInTheDocument();
    expect(screen.queryByTestId("route-wizard")).not.toBeInTheDocument();
  });

  it("mounts the existing SetupWizard + CoachPanel on either route", () => {
    render(<AppShell />);
    expect(screen.getByTestId("setup-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("coach-panel")).toBeInTheDocument();
  });
});

describe("AppShell — theme (default dark + persistence)", () => {
  it("defaults to dark on first load", () => {
    render(<AppShell />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles theme and persists the choice to localStorage", () => {
    render(<AppShell />);
    const toggle = screen.getByRole("button", { name: /switch to/i });

    fireEvent.click(toggle); // dark -> light
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem("gt-theme")).toBe("light");

    fireEvent.click(toggle); // light -> dark
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("gt-theme")).toBe("dark");
  });

  it("respects a saved light preference on load", () => {
    localStorage.setItem("gt-theme", "light");
    render(<AppShell />);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});

describe("AppShell — console drawer state", () => {
  it("toggles drawer open state on the backtick key", () => {
    render(<AppShell />);
    const mount = screen.getByTestId("console-drawer-mount");
    expect(mount.getAttribute("data-open")).toBe("false");

    fireEvent.keyDown(window, { key: "`" });
    expect(mount.getAttribute("data-open")).toBe("true");

    fireEvent.keyDown(window, { key: "`" });
    expect(mount.getAttribute("data-open")).toBe("false");
  });

  it("closes the drawer on Escape", () => {
    render(<AppShell />);
    const mount = screen.getByTestId("console-drawer-mount");

    fireEvent.keyDown(window, { key: "`" });
    expect(mount.getAttribute("data-open")).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mount.getAttribute("data-open")).toBe("false");
  });
});
