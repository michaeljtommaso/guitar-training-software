import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTheme, initTheme, resolveInitialTheme, setTheme } from "./theme";

const KEY = "gt-theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("resolveInitialTheme", () => {
  it("defaults to dark when no preference is saved (spec §1.4)", () => {
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("honors a saved light preference", () => {
    localStorage.setItem(KEY, "light");
    expect(resolveInitialTheme()).toBe("light");
  });

  it("honors a saved dark preference", () => {
    localStorage.setItem(KEY, "dark");
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("falls back to dark for a garbage saved value", () => {
    localStorage.setItem(KEY, "chartreuse");
    expect(resolveInitialTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("sets data-theme=dark for dark", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes data-theme for light (light = no attribute)", () => {
    applyTheme("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});

describe("initTheme", () => {
  it("applies dark on a fresh load and returns it", () => {
    expect(initTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies a saved light preference", () => {
    localStorage.setItem(KEY, "light");
    expect(initTheme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});

describe("setTheme", () => {
  it("applies and persists the chosen theme", () => {
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("light");

    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(KEY)).toBe("dark");
  });
});
