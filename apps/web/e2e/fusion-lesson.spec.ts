import { expect, test } from "@playwright/test";

// WP-4 fusion e2e (fake devices): capture runs, the C-major lesson starts, and
// the fake tone drives real perception events through the fusion engine. We
// assert WHAT THE FAKE TONE HONESTLY PRODUCES — diagnoses about a non-C sound
// (wrong-chord / missing evidence), NOT chord accuracy:
//   (i)   fusion emits Zod-valid-pipeline diagnoses,
//   (ii)  the feedback-policy rate limit holds (no two hints < 1.5 s apart,
//         on the audio-clock hint timestamps),
//   (iii) a session log lands in real IndexedDB and re-validates against the
//         Zod schema,
//   (iv)  event-ingest → hint-emit latency (main-thread, per ingest batch) is
//         measured and printed. This is NOT glass-to-glass latency.
test("fusion lesson: diagnoses flow, hints are rate-limited, session log lands in IndexedDB", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined);

  // Audio pipeline alive before the lesson starts.
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().audio?.framesRead ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Select and start the C-major lesson.
  await page.getByTestId("lesson-select").selectOption("open_chords_c_major");
  await page.getByTestId("lesson-start").click();
  await page.waitForFunction(() => window.__fusionDebug !== undefined);
  await expect(page.getByTestId("lesson-target")).toHaveText("C");

  // (i) Diagnoses flow from the live event stream.
  await expect
    .poll(() => page.evaluate(() => window.__fusionDebug!.snapshot().counts.diagnoses), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);

  // (i.b) CROSS-LEG PROOF. The fake camera yields no live hand detections, so
  // the audio leg alone can't prove cross-leg fusion. We inject a SYNTHETIC (and
  // clearly-labeled) calib + fingerAssign stream through the SAME runtime ingest
  // path the vision worker uses (fusionIngest, via the debug hook — NOT a bypass
  // into the engine), stamped with a skewed worker-style performance.now() `t`
  // AND a real Date.now() wall stamp, so the FIXED clock bridging is exercised
  // (the skewed worker `t` must be ignored). Fake-mic audio flows throughout.
  // We then require a diagnosis whose evidence cites BOTH legs.
  await expect
    .poll(() => page.evaluate(() => window.__fusionDebug!.clockReady()), { timeout: 15_000 })
    .toBe(true); // the audio leg must have established the wall↔audio anchor first
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__fusionDebug!.injectSyntheticVision());
    await page.waitForTimeout(120);
  }
  await expect
    .poll(() => page.evaluate(() => window.__fusionDebug!.crossLegDiagnoses().length), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  const crossLeg = await page.evaluate(() => window.__fusionDebug!.crossLegDiagnoses());
  const xl = crossLeg[crossLeg.length - 1];
  console.log(
    `[fusion-e2e] SYNTHETIC vision injected (worker-clock t ignored, wall stamp used) → ` +
      `cross-leg diagnoses=${crossLeg.length} | sample: code=${xl.code} conf=${xl.conf} ` +
      `audio="${xl.evidence.audio}" vision="${xl.evidence.vision}"`,
  );
  expect(xl.evidence.audio).toBeTruthy();
  expect(xl.evidence.vision).toBeTruthy();

  // (ii) Wait for at least two hints, then verify the 1.5 s rate limit on the
  // audio-clock hint timestamps.
  await expect
    .poll(() => page.evaluate(() => window.__fusionDebug!.hintTimes().length), { timeout: 45_000 })
    .toBeGreaterThanOrEqual(2);
  const hintTimes = await page.evaluate(() => window.__fusionDebug!.hintTimes());
  for (let i = 1; i < hintTimes.length; i++) {
    expect(hintTimes[i] - hintTimes[i - 1]).toBeGreaterThanOrEqual(1500);
  }

  const snap = await page.evaluate(() => window.__fusionDebug!.snapshot());
  expect(snap.counts.diagnoses).toBeGreaterThan(0);

  // (iii) Stop the lesson (final flush) → session log in REAL IndexedDB,
  // re-validated against the Zod schema inside the page.
  await page.getByTestId("lesson-stop").click();
  await expect
    .poll(
      () => page.evaluate(() => window.__fusionDebug!.validateStoredSessions().then((r) => r.count)),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
  const validation = await page.evaluate(() => window.__fusionDebug!.validateStoredSessions());
  expect(validation.allValid).toBe(true);

  // (iv) Latency: event-ingest → hint-emit, main-thread batch processing time.
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN);
  console.log(
    `[fusion-e2e] diagnoses=${snap.counts.diagnoses} hints=${hintTimes.length} dropped=${snap.counts.dropped} ` +
      `evaluations=${snap.counts.evaluations} lastCode=${snap.lastDiagnosis?.code ?? "-"} ` +
      `| ingest→hint-emit latency (main-thread, NOT glass-to-glass): ` +
      `median=${med(snap.hintLatencyMs).toFixed(2)}ms max=${max(snap.hintLatencyMs).toFixed(2)}ms ` +
      `(n=${snap.hintLatencyMs.length}) | ingest→evaluation: median=${med(snap.evalLatencyMs).toFixed(2)}ms ` +
      `max=${max(snap.evalLatencyMs).toFixed(2)}ms (n=${snap.evalLatencyMs.length})`,
  );
  expect(snap.evalLatencyMs.length).toBeGreaterThan(0);
});

// Overlay UX: the lesson's target finger dots draw over the live video via the
// inverse calibration homography, and a CONFIDENT diagnosis latches the overlay
// flash hot-state. We read the overlay's own draw-time debug hook (__overlayDebug)
// rather than pixel-peeping the canvas, so the asserts are robust to headless
// timing. Calibration is a SYNTHETIC identity homography (clearly labeled, no
// accuracy claim) set exactly where a real calibration writes it.
test("overlay: lesson target dots draw over video + a confident diagnosis flashes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start capture" }).click();
  await page.waitForFunction(() => window.__captureDebug !== undefined && window.__overlayDebug !== undefined);

  // Audio alive → the wall↔audio clock anchor can form (needed to rebase vision).
  await expect
    .poll(() => page.evaluate(() => window.__captureDebug!.snapshot().audio?.framesRead ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // Start the C-major lesson.
  await page.getByTestId("lesson-select").selectOption("open_chords_c_major");
  await page.getByTestId("lesson-start").click();
  await page.waitForFunction(() => window.__fusionDebug !== undefined);
  await expect(page.getByTestId("lesson-target")).toHaveText("C");

  // Active but NOT calibrated → the overlay shows the nudge and draws NO dots
  // (never fake positions without a homography).
  await expect
    .poll(() => page.evaluate(() => window.__overlayDebug!.nudge), { timeout: 10_000 })
    .toBe(true);
  expect(await page.evaluate(() => window.__overlayDebug!.targetDotCount)).toBe(0);

  // Inject a SYNTHETIC identity calibration into the overlay's vision hot-state —
  // exactly what setCalibration writes; the frame pump never overwrites it.
  await page.evaluate(() => {
    const vh = window.__captureDebug!.visionHot;
    vh.H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    vh.calibConf = 0.9;
    vh.calibSeenAt = performance.now();
  });

  // (1) Target dots now draw for the active lesson: 3 fingered + 2 open + 1 avoid.
  await expect
    .poll(() => page.evaluate(() => window.__overlayDebug!.targetDotCount), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(6);
  expect(await page.evaluate(() => window.__overlayDebug!.nudge)).toBe(false);

  // (2) Confident wrong/right flash. Fake non-C audio vs the injected canonical C
  // shape yields a CONFIDENT diagnosis; keep injecting until the overlay flash
  // hot-state latches a triad color (below-gate diagnoses would never set it).
  await expect
    .poll(() => page.evaluate(() => window.__fusionDebug!.clockReady()), { timeout: 15_000 })
    .toBe(true);
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__fusionDebug!.injectSyntheticVision());
        return page.evaluate(() => window.__fusionDebug!.hot.flash?.color ?? null);
      },
      { timeout: 30_000, intervals: [150] },
    )
    .not.toBeNull();
  const flash = await page.evaluate(() => window.__fusionDebug!.hot.flash);
  const dotCount = await page.evaluate(() => window.__overlayDebug!.targetDotCount);
  console.log(`[overlay-e2e] target dots drawn=${dotCount} | confident flash color=${flash?.color}`);
  expect(flash).not.toBeNull();
  expect(["error", "correct"]).toContain(flash!.color);

  await page.getByTestId("lesson-stop").click();
});
