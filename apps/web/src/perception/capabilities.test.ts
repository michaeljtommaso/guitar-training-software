import { describe, expect, it } from "vitest";
import { selectBackend } from "./capabilities";

describe("selectBackend", () => {
  it("selects webgpu when the probe returned an adapter", () => {
    expect(selectBackend({ features: new Set() })).toBe("webgpu");
  });

  it("falls back to wasm when the probe returned null or undefined", () => {
    expect(selectBackend(null)).toBe("wasm"); // requestAdapter() resolved null
    expect(selectBackend(undefined)).toBe("wasm"); // navigator.gpu missing
  });
});
