import { expect, test } from "@playwright/test";

// E2E plumbing proof for WP-1 (substitutes for physical hardware): fake
// camera/mic → video frames + rVFC ticks, tone → worklet → SAB ring buffer →
// audio worker stats + glass-to-worker latency, WebGPU/WASM probe, overlay.
test("capture shell smoke with fake devices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();

  // Fake camera delivers decodable frames into the <video>.
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  const videoWidth = await video.evaluate((v: HTMLVideoElement) => v.videoWidth);
  expect(videoWidth).toBeGreaterThan(0);

  // rVFC tick counter: > 25 ticks across a real 2 s window.
  await page.waitForFunction(() => window.__captureDebug !== undefined);
  const t0 = await page.evaluate(() => window.__captureDebug!.hot.rvfcTicks);
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => window.__captureDebug!.hot.rvfcTicks);
  const ticks = t1 - t0;
  expect(ticks).toBeGreaterThan(25);

  // Fake mic tone flows worklet → SAB → worker: stats arrive with real reads.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().audio?.framesRead ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const audio = (await page.evaluate(() => window.__captureDebug!.snapshot().audio))!;
  expect(audio.samplesConsumed).toBeGreaterThan(0);
  expect(typeof audio.dropped).toBe("number");
  expect(audio.dropped).toBeGreaterThanOrEqual(0);

  // Measured glass-to-worker latency: finite, positive.
  expect(Number.isFinite(audio.latencyMs)).toBe(true);
  expect(audio.latencyMs).toBeGreaterThan(0);

  // Capability probe resolved to one of the two valid backends.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().backend), {
      timeout: 15_000,
    })
    .toMatch(/^(webgpu|wasm)$/);
  const backend = await page.evaluate(() => window.__captureDebug!.snapshot().backend);
  const frameDriver = await page.evaluate(() => window.__captureDebug!.snapshot().frameDriver);

  // Overlay canvas is non-blank: the test grid / readout put ink in the
  // top-left 300x100 region.
  const nonBlank = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.overlay-canvas");
    const ctx = canvas?.getContext("2d");
    if (!ctx) return false;
    const d = ctx.getImageData(0, 0, 300, 100).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  expect(nonBlank).toBe(true);

  console.log(
    `[capture-smoke] rvfcTicks/2s=${ticks} videoWidth=${videoWidth} ` +
      `framesRead=${audio.framesRead} samplesConsumed=${audio.samplesConsumed} ` +
      `dropped=${audio.dropped} glassToWorkerLatencyMs=${audio.latencyMs.toFixed(2)} ` +
      `backend=${backend} frameDriver=${frameDriver}`,
  );
});
