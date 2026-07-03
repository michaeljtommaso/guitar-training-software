// ISOLATION-PROOF (the hard guardrail): the frontier/slow-path coach must be
// structurally unable to mutate the real-time correctness loop. The slow path
// may READ fusion outputs; the fast path must NEVER import the coach.
//
// This statically asserts that no file under src/fusion, src/overlay, or
// src/perception imports from src/coach — and, per ADR-011, that NO provider
// name is hard-coded anywhere in the client.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORTS_COACH = /(?:from|import)\s*\(?\s*["'][^"']*\/coach(?:\/|["'])/;

describe("correctness-loop isolation", () => {
  it("no fast-path file (fusion/overlay/perception) imports from coach", () => {
    const offenders: string[] = [];
    for (const dir of ["fusion", "overlay", "perception"]) {
      for (const file of walk(join(SRC, dir))) {
        if (IMPORTS_COACH.test(readFileSync(file, "utf8"))) {
          offenders.push(relative(SRC, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no provider name is hard-coded anywhere in the client (ADR-011)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (/isolation\.test\.tsx?$/.test(file)) continue; // this file names them
      const text = readFileSync(file, "utf8");
      if (/\b(anthropic|openai|gemini)\b/i.test(text) || /\bclaude[-\s]/i.test(text)) {
        offenders.push(relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
