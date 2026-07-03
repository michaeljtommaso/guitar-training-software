import { expect, test } from "@playwright/test";

// WP-2 audio-loop e2e (substitutes for a physical mic): Chromium's fake audio
// device feeds a tone through the real graph — worklet → SAB ring → audio
// worker → own-DSP analysis — and we assert the perception events reach the
// main thread: an onset on the tone, plus a finite tuning/pitch reading.
test("audio analysis events flow from the fake mic to the main thread", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));

  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined);

  // Pipeline alive: audio frames draining from the ring.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().audio?.framesRead ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Onset event: the tone's attack produces spectral flux → an onset.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.onset), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  // A tuning event with a finite cents offset reached the main thread. The
  // tuning event only emits when YIN locks, so a positive count already proves
  // a finite reading flowed.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().eventCounts.tuning), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  // Confirm an instantaneous finite pitch reading is observable (YIN oscillates
  // between a reading and null across windows, so poll rather than snapshot).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const t = window.__captureDebug!.snapshot().audioAnalysis?.tuning;
          return t && Number.isFinite(t.f0) && Number.isFinite(t.cents) ? 1 : 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(1);

  const snap = await page.evaluate(() => window.__captureDebug!.snapshot());
  expect(snap.audioAnalysis).not.toBeNull();

  console.log(
    `[audio-loop] onsets=${snap.eventCounts.onset} chordEvents=${snap.eventCounts.chord} ` +
      `tuningEvents=${snap.eventCounts.tuning} notesEvents=${snap.eventCounts.notes} ` +
      `chord=${snap.audioAnalysis?.chord?.label} ` +
      `tuner=${snap.audioAnalysis?.tuning?.name} f0=${snap.audioAnalysis?.tuning?.f0.toFixed(1)}Hz ` +
      `cents=${snap.audioAnalysis?.tuning?.cents.toFixed(1)}`,
  );
});
