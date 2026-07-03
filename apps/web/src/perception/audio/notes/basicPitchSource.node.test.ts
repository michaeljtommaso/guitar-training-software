// @vitest-environment node
// Proof that Basic Pitch is a REAL model actually running (not a mock): load
// the bundled TF.js weights and transcribe a synthetic guitar note end-to-end
// through the NoteSource seam (incl. 48k→22.05k resampling). Node env because
// TF.js runs cleanly on the Node CPU backend. Numbers here are SYNTHETIC.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { BasicPitchNoteSource } from "./basicPitchSource";
import { harmonicNote } from "../dsp/synth";

const MODEL_DIR = path.resolve("public/models/basic-pitch");
let server: http.Server;
let modelUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const f = path.join(MODEL_DIR, path.basename(req.url ?? ""));
    fs.readFile(f, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.setHeader(
        "content-type",
        (req.url ?? "").endsWith(".json") ? "application/json" : "application/octet-stream",
      );
      res.end(data);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  modelUrl = `http://localhost:${port}/model.json`;
});

afterAll(() => server?.close());

describe("BasicPitchNoteSource (real model, synthetic input)", () => {
  it("transcribes a synthetic A2 (110 Hz) pluck to MIDI ~45", async () => {
    const SR = 48000; // captured rate — exercises the resample to 22.05k
    const note = harmonicNote(110, 2.0, SR, { harmonics: 6, decayTau: 1.2, amp: 0.8 });
    const source = new BasicPitchNoteSource(modelUrl);
    const events = await source.analyze(note, SR, 0);
    const pitches = [...new Set(events.flatMap((e) => e.pitches))].sort((a, b) => a - b);
    console.log(
      `[notes][synthetic] Basic Pitch on A2 pluck → events=${events.length} pitches(midi)=[${pitches.join(",")}]`,
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    // A2 = MIDI 45; allow the model an octave/adjacent slack.
    expect(pitches.some((p) => Math.abs(p - 45) <= 1)).toBe(true);
  }, 60_000);
});
