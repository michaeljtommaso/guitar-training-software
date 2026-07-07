import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// BUG-002 regression: the MediaPipe HandLandmarker must initialize in `vite dev`,
// not only in the production build. This reproduces the original failure surface
// (worker parse error → wasm-loader `?import` fetch fail → "ModuleFactory not
// set.") and asserts none of it happens: the worker loads, the real model runs
// on the sample hand image in-browser, and no vision-loader console errors fire.
test("vision worker initializes in vite dev (BUG-002)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  // Vite dev COLD-START quirk (the reason main's CI check went red): with an
  // empty .vite dep cache — every fresh CI runner — the first page load (and the
  // worker deps requested when capture starts) trigger dependency optimization,
  // and Vite issues a FULL PAGE RELOAD mid-flight. That reload destroys the
  // test's execution context AND resets the wizard, so the whole boot flow must
  // be retried, not just the wait. Deterministically reproduced locally via
  // `rm -rf node_modules/.vite`. At most a couple of reloads ever occur (dep
  // discovery is staggered across entry + worker), hence 3 attempts.
  const bootAndAwaitVisionReady = async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start capture" }).click();
    // Worker created and __visionDebug installed.
    await page.waitForFunction(() => window.__visionDebug !== undefined, { timeout: 30_000 });
    // createHandLandmarker resolves visionReady (or rejects → status "error: …").
    await page.evaluate(() => window.__visionDebug!.ready);
  };
  const RELOAD_ERR = /Execution context was destroyed|Element is not attached|Navigation interrupted/i;
  let bootErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bootAndAwaitVisionReady();
      bootErr = undefined;
      break;
    } catch (err) {
      if (!RELOAD_ERR.test(String(err))) throw err;
      bootErr = err; // vite dev dep-optimization reload — go again on a warmer cache
      console.log(`[vision-dev] vite full-reload during boot (attempt ${attempt}) — retrying`);
    }
  }
  if (bootErr) throw bootErr;

  const status = await page.evaluate(() => window.__visionDebug!.status);
  console.log(`[vision-dev] status after ready: ${status}`);
  expect(status, "HandLandmarker must reach 'ready' in dev").toBe("ready");

  // Prove the REAL model executes in-browser on the official sample hand photo.
  const dataUrl =
    "data:image/jpeg;base64," +
    readFileSync(new URL("../e2e/fixtures/hand.jpg", import.meta.url)).toString("base64");
  const hands = await page.evaluate((url) => window.__visionDebug!.detectImageUrl(url), dataUrl);
  expect(Array.isArray(hands)).toBe(true);
  expect(hands.length).toBeGreaterThan(0);
  expect(hands[0].landmarks.length).toBe(21);

  // The specific dev-only failure modes this fix closes must not appear.
  const visionLoaderErrors = errors.filter((e) =>
    /import statement outside a module|vision_wasm_internal|ModuleFactory not set|Failed to fetch dynamically imported module.*mediapipe/i.test(
      e,
    ),
  );
  expect(visionLoaderErrors, `unexpected vision-loader errors:\n${visionLoaderErrors.join("\n")}`).toEqual(
    [],
  );

  console.log(
    `[vision-dev] hands=${hands.length} landmarks=${hands[0].landmarks.length} handed=${hands[0].handed}`,
  );
});
