import { expect, test } from "@playwright/test";

// Explore-mode e2e (fake devices). Mirrors fusion-lesson.spec.ts's boot
// sequence exactly: goto "/", click "Start capture", wait for
// window.__captureDebug, then confirm the audio pipeline is alive before
// touching anything else. No lesson runs here — flipping to explore mode
// stops any active lesson (exploreStore.setMode rule, spec §4) — and the
// schematic FretboardStrip is deliberately camera-free (spec §5.1), so this
// scenario needs no calibration to prove the picker → strip path works.
test("explore mode: Am voicing renders on the strip; toggle round-trips to practice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined);

  // Audio pipeline alive before touching mode (same liveness gate
  // fusion-lesson.spec.ts uses before it drives anything else).
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().audio?.framesRead ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Practice mode's lesson panel is there by default; the toggle only wraps.
  await expect(page.getByTestId("lesson-select")).toBeVisible();

  await page.getByTestId("mode-explore").click();
  await page.getByTestId("explore-root").selectOption("A");
  await page.getByTestId("explore-suffix").selectOption("minor");

  // Am's real (unmocked) chords-db open voicing is x02210 → project order
  // [0,1,2,2,0,-1]: 3 fingered strings, 2 open, 1 muted (pinned in
  // theory/chords.test.ts against the same real db).
  const strip = page.getByTestId("fretboard-strip");
  await expect(strip).toBeVisible();
  await expect(strip.locator("[data-dot='finger']")).toHaveCount(3);
  await expect(strip.locator("[data-dot='open']")).toHaveCount(2);
  await expect(strip.locator("[data-dot='muted']")).toHaveCount(1);
  await expect(page.getByTestId("explore-voicing-label")).toContainText("1/");

  // Camera overlay — ADR-007 (no calibration → no dots, ever). NOTE ON
  // COVERAGE: this repo's __overlayDebug hook (overlay/drawVision.ts) only
  // counts LESSON target dots (`overlayDebug.targetDotCount` is written from
  // `planTargets(fusionHot...)`); there is no equivalent counter wired for
  // `exploreDots()`, so an e2e assertion of "camera draws N explore dots"
  // would require adding a new debug hook, which is out of this task's
  // territory (see task-8-9-report.md). What IS verifiable end-to-end,
  // without touching overlay code, is the gate condition itself:
  // drawVision.ts never calls drawExploreDots() unless `visionHot.H` is set,
  // and this spec never calibrates, so that precondition is false — no
  // camera dots are possible. The FretboardStrip assertions above already
  // give full positive dot-count coverage for the explore-mode picker path.
  const calibrated = await page.evaluate(() => window.__captureDebug!.visionHot.H !== null);
  expect(calibrated).toBe(false);

  // Switching back to practice restores the lesson panel; the toggle itself
  // (both buttons) stays visible in either mode.
  await page.getByTestId("mode-practice").click();
  await expect(page.getByTestId("mode-explore")).toBeVisible();
  await expect(page.getByTestId("lesson-select")).toBeVisible();
});
