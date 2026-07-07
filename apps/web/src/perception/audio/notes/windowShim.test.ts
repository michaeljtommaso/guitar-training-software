// @vitest-environment node
// BUG-003 regression test. TF.js's browser platform calls `window.setTimeout`,
// but a Web Worker's global is `self`, not `window`. We run this file under
// vitest's `node` environment (no ambient `window` global, like a worker)
// so we can exercise both cases:
//  1. `window` missing (the worker case) -> the shim installs a working alias.
//  2. `window` already present (main thread / jsdom) -> the shim is a no-op,
//     so it can never clobber the real DOM `window` if accidentally imported
//     outside the worker.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type MaybeWindow = { window?: unknown };

describe("windowShim (BUG-003)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as MaybeWindow).window;
  });

  afterEach(() => {
    delete (globalThis as MaybeWindow).window;
  });

  it("aliases window to globalThis when window is missing (worker case)", async () => {
    expect((globalThis as MaybeWindow).window).toBeUndefined();

    await import("./windowShim");

    expect(globalThis.window).toBe(globalThis);
    expect(typeof globalThis.window.setTimeout).toBe("function");

    // Prove the alias actually works, not just that it's defined.
    await new Promise<void>((resolve) => {
      globalThis.window.setTimeout(resolve, 0);
    });
  });

  it("does not overwrite an existing window (main-thread/jsdom safety)", async () => {
    const sentinel = { setTimeout: () => {} } as unknown as typeof globalThis;
    (globalThis as MaybeWindow).window = sentinel;

    await import("./windowShim");

    expect(globalThis.window).toBe(sentinel);
  });
});
