import { expect, test } from "@playwright/test";

// ADR-013 e2e: the wet monitor produces sound only when enabled, and the dry
// analysis path is indifferent to it (dry = truth source).
test("tone monitor gates output and never disturbs analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined && window.__toneDebug !== undefined);

  // Analysis alive before touching tone.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning), { timeout: 20_000 })
    .toBeGreaterThan(0);

  // Monitor off (default) → silent output.
  await expect
    .poll(() => page.evaluate(() => window.__toneDebug!.outputRms()), { timeout: 10_000 })
    .toBeLessThan(1e-4);

  // Amp mode → audible output.
  await page.getByLabel("Monitor").selectOption("amp");
  await expect
    .poll(() => page.evaluate(() => window.__toneDebug!.outputRms()), { timeout: 30_000 })
    .toBeGreaterThan(1e-3);

  // Dry-path integrity: analysis keeps flowing with identical pitch while the
  // wet chain runs at high drive.
  //
  // DEVIATION from plan text (measured, not a threshold tweak): YIN needs a
  // ~8-9s warm-up against this fake device signal before it locks, and even
  // once locked it still oscillates between a reading and null across
  // windows (same caveat audio-loop.spec.ts documents). The plan's snippet
  // read f0Before/f0After via a raw snapshot, which intermittently caught the
  // pre-lock/null window and produced NaN or a transient octave-error
  // reading (measured: one run diffed by ~200Hz, half of the real 400.9Hz —
  // a classic pre-lock octave error), failing ~5/6 standalone runs. Poll for
  // a finite reading on both sides instead of snapshotting once, mirroring
  // the established "poll rather than snapshot" convention in
  // audio-loop.spec.ts. The 2Hz tolerance itself is untouched.
  const finiteF0 = async () =>
    page.evaluate(() => {
      const f0 = window.__captureDebug!.snapshot().audioAnalysis?.tuning?.f0;
      return Number.isFinite(f0) ? f0! : NaN;
    });
  await expect.poll(finiteF0, { timeout: 20_000 }).not.toBeNaN();
  const f0Before = await finiteF0();
  const before = await page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning);
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning), { timeout: 20_000 })
    .toBeGreaterThan(before);
  await expect.poll(finiteF0, { timeout: 20_000 }).not.toBeNaN();
  const f0After = await finiteF0();
  expect(Math.abs(f0After - f0Before)).toBeLessThan(2); // same fake tone, same reading
});
