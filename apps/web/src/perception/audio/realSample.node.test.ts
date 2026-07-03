// @vitest-environment node
// Plumbing proof on a REAL guitar recording (deliverable 8): decode a WAV and
// run the full offline analysis path — spectral-flux onset, chroma→chord
// template match, YIN tuner, and Basic Pitch notes — printing what the pipeline
// detects. NO accuracy is claimed: these are one clip's raw detections, printed
// for eyeballing, not a scored gate.
//
// The clip is NOT committed (size + provenance/licensing). Point the test at a
// local mono/stereo PCM WAV via GUITAR_WAV=/path/to.wav; absent a file it skips
// so the suite stays deterministic and network-free.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { analyzeSignal } from "./analysis";
import { BasicPitchNoteSource } from "./notes/basicPitchSource";
import { midiName } from "./dsp/pitch";

// Decode a PCM WAV (16/24/32-bit int or 32-bit float) to mono Float32 + rate.
function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let off = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOff = -1;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      };
    } else if (id === "data") {
      dataOff = off + 8;
      dataLen = sz;
    }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || dataOff < 0) throw new Error("missing fmt/data chunk");
  const { channels, sampleRate, bits, audioFormat } = fmt;
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLen / (bytesPerSample * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const p = dataOff + (i * channels + c) * bytesPerSample;
      let v: number;
      if (audioFormat === 3 && bits === 32) v = buf.readFloatLE(p);
      else if (bits === 16) v = buf.readInt16LE(p) / 32768;
      else if (bits === 24) {
        const raw = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
        v = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
      } else if (bits === 32) v = buf.readInt32LE(p) / 2147483648;
      else throw new Error(`unsupported bit depth ${bits}`);
      acc += v;
    }
    out[i] = acc / channels; // downmix to mono
  }
  return { samples: out, sampleRate };
}

const WAV_PATH =
  process.env.GUITAR_WAV ||
  path.resolve("src/perception/audio/__fixtures__/guitar.wav"); // drop a clip here
const HAVE_WAV = fs.existsSync(WAV_PATH);

const MODEL_DIR = path.resolve("public/models/basic-pitch");
let server: http.Server;
let modelUrl: string;

beforeAll(async () => {
  if (!HAVE_WAV) return;
  server = http.createServer((req, res) => {
    fs.readFile(path.join(MODEL_DIR, path.basename(req.url ?? "")), (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end("no");
        return;
      }
      res.end(data);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  modelUrl = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}/model.json`;
});

afterAll(() => server?.close());

describe.skipIf(!HAVE_WAV)("real guitar sample — offline pipeline (no accuracy claim)", () => {
  it("prints onset/chord/tuner/notes detections for a real recording", async () => {
    const { samples, sampleRate } = decodeWav(fs.readFileSync(WAV_PATH));
    const durSec = samples.length / sampleRate;

    // DSP legs over the whole clip.
    const { events, final } = analyzeSignal(samples, sampleRate);
    const onsets = events.filter((e) => e.kind === "onset");
    const chordEvents = events.filter((e) => e.kind === "chord");
    const chordLabels = [...new Set(chordEvents.map((e) => (e.kind === "chord" ? e.label : "")))];

    // Basic Pitch over the first ~6 s (keeps CPU inference snappy).
    const excerpt = samples.subarray(0, Math.min(samples.length, Math.floor(6 * sampleRate)));
    const notes = await new BasicPitchNoteSource(modelUrl).analyze(excerpt, sampleRate, 0);
    const pitches = [...new Set(notes.flatMap((n) => n.pitches))].sort((a, b) => a - b);

    console.log(`[real-sample] file=${path.basename(WAV_PATH)} dur=${durSec.toFixed(1)}s sr=${sampleRate}`);
    console.log(`[real-sample] onsets=${onsets.length} chordEvents=${chordEvents.length} labelsSeen=[${chordLabels.join(",")}] finalChord=${final.chord?.label}`);
    console.log(`[real-sample] tuner(last)=${final.tuning ? `${final.tuning.name} ${final.tuning.cents.toFixed(1)}c` : "none"}`);
    console.log(`[real-sample] BasicPitch pitches(midi)=[${pitches.join(",")}] names=[${pitches.map(midiName).join(" ")}] noteEvents=${notes.length}`);

    // Plumbing assertions only — the pipeline produced *some* structured output.
    expect(events.length).toBeGreaterThan(0);
    expect(onsets.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
  }, 90_000);
});
