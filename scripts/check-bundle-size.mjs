#!/usr/bin/env node
// Bundle-size budget: sums gzipped JS in apps/web/dist/assets and fails the
// build if the total exceeds the budget.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGET_KB = 250;
const ASSETS_DIR = join("apps", "web", "dist", "assets");

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`bundle-size: could not read ${ASSETS_DIR} — run \`pnpm build\` first.`);
  process.exit(1);
}

const totalGzipBytes = files.reduce((sum, file) => {
  const raw = readFileSync(join(ASSETS_DIR, file));
  return sum + gzipSync(raw).length;
}, 0);

const totalKb = totalGzipBytes / 1024;
console.log(`bundle-size: ${totalKb.toFixed(2)} KB gzipped JS (budget ${BUDGET_KB} KB, ${files.length} file(s))`);

if (totalKb > BUDGET_KB) {
  console.error(`bundle-size: FAIL — exceeds ${BUDGET_KB} KB budget`);
  process.exit(1);
}
