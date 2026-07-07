// IR wiring lock (cabIR.test.ts sibling). The cab picker offers real, CC0
// cabinet IRs from public/irs/. This verifies the catalog wiring: labels are
// descriptive (no amp trademarks), the synthetic default is never one of them,
// and every referenced .wav actually ships, is a real RIFF/WAVE file, and its
// bytes tie out to the sha256 recorded in public/irs/MANIFEST.md (the firewall
// provenance record — asset and manifest can't silently drift apart).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_CABINETS } from "./cabinets";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/src/tone
const PUBLIC = join(HERE, "..", "..", "public"); // apps/web/public
const manifest = readFileSync(join(PUBLIC, "irs", "MANIFEST.md"), "utf8");

describe("BUNDLED_CABINETS", () => {
  it("exposes descriptive, non-trademarked labels with unique ids", () => {
    expect(BUNDLED_CABINETS.length).toBeGreaterThanOrEqual(2);
    const trademarked = /marshall|fender|vox|mesa|orange|celestion|boogie|korg|ac15|ac30/i;
    for (const c of BUNDLED_CABINETS) {
      expect(c.label, c.id).not.toMatch(trademarked);
      expect(c.id).not.toBe("synthetic"); // synthetic stays the reserved default
      expect(c.file).toMatch(/^\/irs\/.+\.wav$/);
    }
    const ids = BUNDLED_CABINETS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each cabinet .wav ships, is a valid RIFF/WAVE, and matches its MANIFEST sha256", () => {
    for (const c of BUNDLED_CABINETS) {
      const bytes = readFileSync(join(PUBLIC, c.file.replace(/^\//, "")));
      expect(bytes.length, `${c.id} size`).toBeGreaterThan(44); // header + samples
      expect(bytes.subarray(0, 4).toString("latin1"), `${c.id} RIFF`).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("latin1"), `${c.id} WAVE`).toBe("WAVE");
      const sha = createHash("sha256").update(bytes).digest("hex");
      expect(manifest, `${c.id} sha256 not recorded in MANIFEST`).toContain(sha);
    }
  });
});
