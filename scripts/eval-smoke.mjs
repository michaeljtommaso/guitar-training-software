#!/usr/bin/env node
// Model-eval SMOKE — the synthetic-fixture REGRESSION gate (WP-7, §15/§16 CI).
//
// Runs the committed synthetic fixtures through the REAL code paths (chord
// matcher, fingertip→string/fret, onset detector, analyzer latency) via a
// dedicated vitest run, and fails the build on any regression.
//
// SCOPE LABEL (do not remove): this is a synthetic-fixture regression gate —
// NOT the §16 accuracy gates. It makes NO real-guitar accuracy claim and does
// NOT verify the §16 latency budgets (those need real captures + the reference
// laptop — see docs/blockers.md). It only proves the code still behaves as it did on
// synthetic input; a single corrupted constant MUST turn it red.
import { spawnSync } from "node:child_process";

const BANNER = "eval-smoke: synthetic-fixture regression gate — NOT the §16 accuracy gates";
console.log(`\n=== ${BANNER} ===\n`);

// shell:true so Windows resolves pnpm.cmd (Node refuses to spawn .cmd directly
// post-CVE-2024-27980). All args are static literals — no injection surface.
const res = spawnSync(
  "pnpm --filter ./apps/web exec vitest run src/eval/evalSmoke.test.ts",
  { encoding: "utf8", stdio: "inherit", shell: true },
);

if (res.error) {
  console.error(`eval-smoke: FAIL — could not run vitest: ${res.error.message}`);
  process.exit(1);
}
if (res.status !== 0) {
  console.error(`\n=== eval-smoke: FAIL — a synthetic-fixture regression was detected (exit ${res.status}) ===`);
  process.exit(res.status ?? 1);
}
console.log(`\n=== eval-smoke: PASS — synthetic fixtures unchanged (regression gate green) ===`);
