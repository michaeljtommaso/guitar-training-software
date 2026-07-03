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
});
