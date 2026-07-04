#!/usr/bin/env node
// GuitarSet real-audio eval runner (Q-04). Runs the REAL production chord matcher
// over GuitarSet mono-mic recordings and writes models/audio/guitarset-eval-report.md.
//
// This is an EVAL, not a gate (yet): it exits nonzero ONLY on a script/test error,
// never on a low accuracy number — a bad number is honest Q-04 data.
//
//   node scripts/eval-guitarset.mjs            # all comp + solo takes
//   node scripts/eval-guitarset.mjs --limit 12 # quick subset (first 12 excerpts)
//
// Data dir defaults to the absolute extracted path; override with GUITARSET_DIR.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const li = args.indexOf("--limit");
const limit = li >= 0 ? args[li + 1] : "";

const env = { ...process.env, RUN_GUITARSET_EVAL: "1" };
if (limit) env.GUITARSET_LIMIT = limit;

console.log(`\n=== guitarset eval: REAL-audio chord matcher (Q-04) — NOT the §16 gate ===`);
console.log(limit ? `(quick run, --limit ${limit})\n` : `(full run: all comp + solo takes)\n`);

// shell:true so Windows resolves pnpm.cmd; all args are static literals.
const res = spawnSync(
  "pnpm --filter ./apps/web exec vitest run src/eval/guitarsetEval.test.ts",
  { encoding: "utf8", stdio: "inherit", shell: true, env },
);

if (res.error) {
  console.error(`guitarset eval: FAIL — could not run vitest: ${res.error.message}`);
  process.exit(1);
}
process.exit(res.status ?? 1);
