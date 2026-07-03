#!/usr/bin/env node
// WP-6 public-data bootstrap (§13: eval hold-outs). Downloads what is
// directly fetchable without auth into data/eval/ (gitignored) with a
// manifest.json (source URL, license, sha256, size) — ADR-011 license
// hygiene: every entry records its license so nothing NC/gated silently
// enters a training/eval pipeline unlabeled.
//
// Scope (deliberately small — see docs/opus-stack-implementation-plan.md
// §13 and the WP-6 brief): GuitarSet (open, CC-BY-4.0, Zenodo) is the only
// dataset actually fetched. IDMT-SMT-GUITAR is form/registration-gated with
// a NonCommercial license variant (CC BY-NC-ND) — per ADR-011 that's
// offline-experiment territory at best, so this script does NOT fetch it;
// it only records what a human must do. Isolated Guitar Chords /
// Guitar-TECHS are out of scope for tonight's bootstrap (not requested).
//
// Timeboxed to ~10 minutes total: each download gets its own timeout: a
// real failure (including a timeout) is recorded with its exact error in
// manifest.json and the script moves on — never fakes a download.
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EVAL_DIR = join(ROOT, "data", "eval");
const DRY_RUN = process.argv.includes("--dry-run");

// GuitarSet, Zenodo record 3371780 (verified via https://zenodo.org/api/records/3371780).
const GUITARSET_LICENSE = "CC-BY-4.0";
const GUITARSET_LICENSE_NOTE =
  "CC-BY-4.0: free to use, modify, and redistribute (including for training/eval) with attribution " +
  "to Xi/Bittner/Pauwels/Ye/Bello, ISMIR 2018. No NonCommercial/ShareAlike restriction — safe for the " +
  "internal eval-holdout lane per ADR-011.";
const GUITARSET_FILES = {
  annotation: { key: "annotation.zip", size: 39132574 },
  audioMonoMic: { key: "audio_mono-mic.zip", size: 656927981 },
};
const zenodoUrl = (file) => `https://zenodo.org/api/records/3371780/files/${file}/content`;

const PLAN = [
  {
    id: "guitarset-annotation",
    name: "GuitarSet annotations (JAMS: pitch contours, string/fret, chords, beats)",
    url: zenodoUrl(GUITARSET_FILES.annotation.key),
    license: GUITARSET_LICENSE,
    licenseNote: GUITARSET_LICENSE_NOTE,
    expectedSize: GUITARSET_FILES.annotation.size,
    dest: join(EVAL_DIR, "guitarset", GUITARSET_FILES.annotation.key),
    timeoutMs: 4 * 60_000, // small file (~39 MB); generous timeout still fits the 10-min total budget
  },
  {
    id: "guitarset-audio-mono-mic",
    name: "GuitarSet audio — audio_mono-mic (smallest of the 4 audio archives)",
    url: zenodoUrl(GUITARSET_FILES.audioMonoMic.key),
    license: GUITARSET_LICENSE,
    licenseNote: GUITARSET_LICENSE_NOTE,
    expectedSize: GUITARSET_FILES.audioMonoMic.size,
    dest: join(EVAL_DIR, "guitarset", GUITARSET_FILES.audioMonoMic.key),
    timeoutMs: 5 * 60_000, // ~657 MB; likely exceeds the remaining timebox on a modest link — allowed to time out
  },
];

const DOCUMENTED_ONLY = [
  {
    id: "idmt-smt-guitar",
    name: "IDMT-SMT-GUITAR",
    status: "skipped",
    reason:
      "Form/registration-gated distribution, and the license (CC BY-NC-ND 4.0) is NonCommercial — " +
      "per ADR-011 that's offline-experiment territory at best, never a shippable-artifact input. " +
      "Not auto-fetched. A human who wants it for offline eval must request/download it manually.",
    humanAction: "Visit https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html and follow Fraunhofer IDMT's own request/licensing process.",
    license: "CC-BY-NC-ND-4.0 (variant-dependent — verify per subset)",
  },
];

async function hashFile(path) {
  const { createReadStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const rs = createReadStream(path);
    rs.on("data", (chunk) => hash.update(chunk));
    rs.on("end", () => resolve(hash.digest("hex")));
    rs.on("error", reject);
  });
}

async function downloadOne(item) {
  mkdirSync(dirname(item.dest), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${item.timeoutMs}ms`)), item.timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(item.url, { signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const out = createWriteStream(item.dest);
    await finished(Readable.fromWeb(res.body).pipe(out));
    const size = statSync(item.dest).size;
    const sha256 = await hashFile(item.dest);
    return {
      ...baseEntry(item),
      status: "downloaded",
      size,
      sha256,
      elapsedMs: Date.now() - start,
    };
  } catch (err) {
    if (existsSync(item.dest)) unlinkSync(item.dest); // never leave a partial/corrupt file behind
    return {
      ...baseEntry(item),
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

function baseEntry(item) {
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    license: item.license,
    licenseNote: item.licenseNote,
    expectedSize: item.expectedSize,
  };
}

async function main() {
  console.log(`fetch-eval-data: ${DRY_RUN ? "DRY RUN (no network calls)" : "fetching"}`);
  for (const item of PLAN) {
    console.log(`  - ${item.id}: ${item.url} (~${(item.expectedSize / 1e6).toFixed(1)} MB, ${item.license}) -> ${item.dest}`);
  }
  for (const item of DOCUMENTED_ONLY) {
    console.log(`  - ${item.id}: SKIPPED (${item.reason})`);
  }
  if (DRY_RUN) {
    console.log("fetch-eval-data: dry-run complete, no files written.");
    return;
  }

  mkdirSync(EVAL_DIR, { recursive: true });
  const results = [];
  for (const item of PLAN) {
    console.log(`fetch-eval-data: downloading ${item.id} ...`);
    const result = await downloadOne(item);
    console.log(`fetch-eval-data: ${item.id} -> ${result.status}${result.error ? ` (${result.error})` : ""}`);
    results.push(result);
  }
  for (const item of DOCUMENTED_ONLY) {
    results.push(item);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    note: "data/eval/ is gitignored — this manifest is the durable, committed record of what was (or wasn't) fetched.",
    entries: results,
  };
  await writeFile(join(EVAL_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`fetch-eval-data: wrote ${join(EVAL_DIR, "manifest.json")}`);
}

await main();
