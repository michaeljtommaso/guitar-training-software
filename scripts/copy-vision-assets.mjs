#!/usr/bin/env node
// WP-3: copy MediaPipe Tasks-Vision WASM out of node_modules into apps/web/public
// so the HandLandmarker loads its runtime LOCALLY (fully offline — no CDN). Run
// automatically via apps/web predev/prebuild. The .task model is downloaded and
// committed separately in apps/web/public/models/.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(repoRoot, "apps/web/public/models/mediapipe/wasm");

// pnpm symlinks the package into apps/web/node_modules; fall back to the store.
const candidates = [
  join(repoRoot, "apps/web/node_modules/@mediapipe/tasks-vision/wasm"),
  ...findInPnpmStore(repoRoot),
];
const src = candidates.find((p) => existsSync(p));
if (!src) {
  console.error("copy-vision-assets: FAIL — @mediapipe/tasks-vision/wasm not found. Run pnpm install.");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-vision-assets: copied ${readdirSync(dest).length} MediaPipe WASM file(s) → ${dest}`);

function findInPnpmStore(root) {
  const store = join(root, "node_modules/.pnpm");
  if (!existsSync(store)) return [];
  return readdirSync(store)
    .filter((d) => d.startsWith("@mediapipe+tasks-vision@"))
    .map((d) => join(store, d, "node_modules/@mediapipe/tasks-vision/wasm"));
}
