#!/usr/bin/env node
// WP-0b license firewall (ADR-011). Fails the build on any AGPL/GPL/LGPL/NC/
// SSPL/BUSL — or otherwise unknown — license reaching the SHIPPED CLIENT
// BUNDLE (= the production dependency tree of apps/web). Dev deps never ship
// and are exempt.
//
// Mechanism: `pnpm list --prod --depth Infinity --json` for apps/web gives the
// full transitive PRODUCTION closure straight from pnpm's own resolver (so no
// transitive prod dep can be silently missed), then we read each installed
// package's own package.json `license` field and run it through the audited,
// unit-tested decision logic in license-rules.mjs. Unknown/missing/unparseable
// = FAIL (fail-closed).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPackage } from "./license-rules.mjs";

// Explicitly-reviewed overrides for the fail-closed unknown case, keyed by
// "name@version". Every entry is a deliberate, human-reviewed decision — keep
// it empty/minimal. Name-denylisted packages (Essentia/Ultralytics/Madmom)
// can NOT be exempted here.
const EXCEPTIONS = {
  // "some-pkg@1.2.3": "reviewed 2026-07-03: public-domain, no SPDX id declared",
};

const FILTER = "./apps/web";

function fail(msg, extra) {
  console.error(`license-check: FAIL — ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

// --- 1. Resolve the production dependency closure of apps/web -------------
// shell:true so Windows resolves pnpm.cmd (Node refuses to spawn .cmd directly
// post-CVE-2024-27980). All args are static literals — no injection surface.
const res = spawnSync(
  `pnpm --filter ${FILTER} list --prod --depth Infinity --json`,
  { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, shell: true },
);
if (res.error) fail(`could not run pnpm to resolve ${FILTER} prod tree`, res.error.message);
if (res.status !== 0) fail(`pnpm exited ${res.status} resolving ${FILTER} prod tree`, res.stderr);

let projects;
try {
  projects = JSON.parse(res.stdout);
} catch (e) {
  fail("could not parse pnpm list JSON", e.message);
}
if (!Array.isArray(projects) || projects.length === 0) {
  fail(`no workspace project matched ${FILTER} — refusing to pass on an empty result`);
}

// --- 2. Walk the tree, dedupe real installed packages by path ------------
const seen = new Map(); // path -> { name, version, path }
function collect(deps) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    const p = info.path;
    // Only real installed deps live under node_modules; workspace/linked
    // projects (the app itself) live in apps/* and are skipped — they are the
    // bundle, not dependencies of it.
    if (p && p.includes("node_modules") && !seen.has(p)) {
      seen.set(p, { name, version: info.version, path: p });
    }
    if (info.dependencies) collect(info.dependencies);
  }
}
for (const project of projects) {
  collect(project.dependencies);
  collect(project.optionalDependencies);
}

// --- 3. Read each package's declared license from its package.json --------
function readLicense(pkgPath) {
  let pj;
  try {
    pj = JSON.parse(readFileSync(join(pkgPath, "package.json"), "utf8"));
  } catch {
    return null; // unreadable -> unknown -> fail-closed
  }
  if (typeof pj.license === "string") return pj.license;
  if (pj.license && typeof pj.license === "object" && pj.license.type) return pj.license.type;
  if (Array.isArray(pj.licenses)) {
    // Deprecated dual-license form: historically "under any of these" -> OR.
    const types = pj.licenses.map((l) => l && l.type).filter(Boolean);
    if (types.length) return types.join(" OR ");
  }
  return null;
}

// --- 4. Decide ------------------------------------------------------------
const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const offenders = [];
for (const pkg of packages) {
  const license = readLicense(pkg.path);
  const verdict = checkPackage({ name: pkg.name, version: pkg.version, license, exceptions: EXCEPTIONS });
  if (!verdict.ok) offenders.push(verdict);
}

if (offenders.length > 0) {
  console.error(`license-check: FAIL — ${offenders.length} disallowed package(s) in the apps/web production bundle:`);
  for (const o of offenders) {
    console.error(`  ✗ ${o.id} — license: ${o.license ?? "MISSING"} — ${o.reason}`);
  }
  process.exit(1);
}

console.log(
  `license-check: PASS — ${packages.length} production package(s) in apps/web bundle, all licenses cleared (ADR-011)`,
);
