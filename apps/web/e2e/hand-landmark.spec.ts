import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// WP-3 real-image plumbing proof: the REAL MediaPipe HandLandmarker runs
// in-browser on the official sample hand photo (fixtures/hand.jpg, from
// MediaPipe's docs) and returns 21 landmarks + handedness. The fake camera
// shows no hand, so the still-image path (fed to the vision worker as an
// ImageBitmap) is the proof the model actually executes.
test("real HandLandmarker returns 21 landmarks on the sample hand image", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();

  // Vision worker + landmarker created (createHandLandmarker resolves visionReady).
  await page.waitForFunction(() => window.__visionDebug !== undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__visionDebug!.ready);

  // Feed the fixture as a data URL so the page can fetch it without shipping it.
  const dataUrl =
    "data:image/jpeg;base64," +
    readFileSync(new URL("./fixtures/hand.jpg", import.meta.url)).toString("base64");

  const status = await page.evaluate(() => window.__visionDebug!.status);
  console.log(`[hand-image] vision status after ready: ${status}`);

  const hands = await page.evaluate((url) => window.__visionDebug!.detectImageUrl(url), dataUrl);
  if (errors.length) console.log(`[hand-image] page errors:\n${errors.join("\n")}`);

  expect(Array.isArray(hands)).toBe(true);
  expect(hands.length).toBeGreaterThan(0);
  const hand = hands[0];
  expect(hand.landmarks.length).toBe(21);
  for (const [x, y] of hand.landmarks) {
    expect(x).toBeGreaterThanOrEqual(-0.1);
    expect(x).toBeLessThanOrEqual(1.1);
    expect(y).toBeGreaterThanOrEqual(-0.1);
    expect(y).toBeLessThanOrEqual(1.1);
  }
  expect(["L", "R"]).toContain(hand.handed);

  console.log(
    `[hand-image] hands=${hands.length} landmarks=${hand.landmarks.length} ` +
      `handed=${hand.handed} conf=${hand.conf.toFixed(3)}`,
  );
});
