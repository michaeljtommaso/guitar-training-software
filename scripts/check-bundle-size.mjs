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
//     ChArUco calibration), and sentry (loaded only when a DSN is configured;
//     WP-7 §15), and any other on-demand vendor split.
// These carry the large, license-clean perception libs (MediaPipe, OpenCV, and
// later ONNX Runtime) the stack MUST ship; budgeting them as initial load would
// be meaningless. Their sizes are still reported for visibility.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET_KB = 250;
const ASSETS_DIR = join("apps", "web", "dist", "assets");

// A chunk is DEFERRED (off the initial path) if its name marks it as a worker,
// an audio worklet, or a lazily-imported vendor split. Names are an explicit
// allowlist on purpose — a new lazy chunk must be named here (via vite.config
// manualChunks) to earn the exemption, never inferred.
const DEFERRED = /(worker|processor|opencv|sentry|chords-db)/i;

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

// Fail-closed guard: a real Vite build always emits an entry chunk (index-*.js)
// on the initial path. Zero initial chunks means the DEFERRED classifier
// swallowed everything (or the build produced no entry) — never a silent pass.
if (initial.length === 0) {
  console.error(
    `bundle-size: FAIL — no initial (non-deferred) JS chunk found among ${files.length} file(s); ` +
      `the initial-payload budget cannot be verified. Check the DEFERRED classifier / build output.`,
  );
  process.exit(1);
}

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
