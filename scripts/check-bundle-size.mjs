#!/usr/bin/env node
// Bundle-size budget for the INITIAL main-thread payload: sums gzipped JS that
// loads on first paint and fails the build if it exceeds the budget.
//
// DEFERRED chunks are excluded from the budget because they are NOT on the
// initial critical path:
//   • Web WORKER bundles (visionWorker, audioWorker) — load when capture starts,
//     run off the main thread.
//   • AudioWorklet processors (capture-processor) — load into the audio thread.
//   • LAZY dynamic-import chunks — opencv.js (loaded only when the user runs
//     ChArUco calibration), and any other on-demand vendor split.
// These carry the large, license-clean perception libs (MediaPipe, OpenCV, and
// later ONNX Runtime) the stack MUST ship; budgeting them as initial load would
// be meaningless. Their sizes are still reported for visibility.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET_KB = 250;
const ASSETS_DIR = join("apps", "web", "dist", "assets");

// A chunk is DEFERRED (off the initial path) if its name marks it as a worker,
// an audio worklet, or a lazily-imported vendor split.
const DEFERRED = /(worker|processor|opencv)/i;

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`bundle-size: could not read ${ASSETS_DIR} — run \`pnpm build\` first.`);
  process.exit(1);
}

const gz = (file) => gzipSync(readFileSync(join(ASSETS_DIR, file))).length;
const initial = files.filter((f) => !DEFERRED.test(f));
const deferred = files.filter((f) => DEFERRED.test(f));

const initialKb = initial.reduce((s, f) => s + gz(f), 0) / 1024;
const deferredKb = deferred.reduce((s, f) => s + gz(f), 0) / 1024;

console.log(
  `bundle-size: initial ${initialKb.toFixed(2)} KB gzipped JS ` +
    `(budget ${BUDGET_KB} KB, ${initial.length} file(s)); ` +
    `deferred ${deferredKb.toFixed(2)} KB across ${deferred.length} worker/worklet/lazy chunk(s)`,
);

if (initialKb > BUDGET_KB) {
  console.error(`bundle-size: FAIL — initial payload exceeds ${BUDGET_KB} KB budget`);
  process.exit(1);
}
