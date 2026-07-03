import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STATUS_COLORS } from "./statusColors";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

describe("STATUS_COLORS", () => {
  it("exports exactly the status-triad + uncertain keys", () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual(
      ["correct", "error", "uncertain", "warn"].sort(),
    );
  });

  it("uses a valid hex color for every key", () => {
    for (const value of Object.values(STATUS_COLORS)) {
      expect(value).toMatch(HEX_COLOR);
    }
  });

  it("matches the light-theme --correct/--warn/--error/--uncertain tokens in tokens.css", () => {
    // tokens.css declares these as one level of var() indirection to a
    // --raw-* layer-1 value; resolve that indirection and compare.
    // fileURLToPath(import.meta.url) (not `new URL(...)`) because jsdom's
    // test environment shadows the global URL constructor, which trips
    // Node's file:-scheme check in fs.
    const tokensPath = fileURLToPath(import.meta.url).replace(/statusColors\.test\.ts$/, "tokens.css");
    const css = readFileSync(tokensPath, "utf-8");
    // Split on the dark-theme *rule* (brace included), not just the
    // selector text — the file header comment also mentions
    // `[data-theme="dark"]` in prose, above the real :root block.
    const lightBlock = css.slice(0, css.indexOf('[data-theme="dark"] {'));

    for (const key of Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]) {
      const ref = lightBlock.match(new RegExp(`--${key}:\\s*var\\((--raw-[\\w-]+)\\);`));
      expect(ref, `--${key} missing/not a var() ref in tokens.css :root`).not.toBeNull();
      const raw = lightBlock.match(new RegExp(`${ref![1]}:\\s*(#[0-9a-fA-F]{6});`));
      expect(raw, `${ref![1]} not defined in tokens.css :root`).not.toBeNull();
      expect(raw![1].toLowerCase()).toBe(STATUS_COLORS[key].toLowerCase());
    }
  });
});
