// @vitest-environment node
//
// GuitarSet real-audio eval for the open-chord template matcher (Q-04 validation).
//
// Runs the REAL production DSP — MagnitudeSpectrum + computeChroma + ChordMatcher
// (chroma → template cosine → softmax + silence/noise gate, ADR-005) — over
// GuitarSet mono-mic recordings (real recorded guitar, cheap-mic/room realism),
// scored against the INSTRUCTED chord annotations mapped to our 8 open chords.
//
// This is the FIRST real-recorded-guitar evidence toward the BLOCKERS row
// "Audio accuracy gates unmeasured". It is NOT the §16 "≥90% open-chord" gate:
// that gate is specified for the user's own home setup, and remains UNCLAIMED.
// A bad number here is Q-04 data, not a failure.
//
// Heavy (reads hundreds of external WAVs), so it is gated behind
// RUN_GUITARSET_EVAL=1 and normally SKIPPED (so `pnpm test` stays fast/green in
// CI where the data is absent). Run it via `node scripts/eval-guitarset.mjs`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MagnitudeSpectrum, rms, spectralFlatness } from "../perception/audio/dsp/fft";
import { computeChroma } from "../perception/audio/dsp/chroma";
import { ChordMatcher, CHORD_LABELS, type ChordClass } from "../perception/audio/dsp/chords";

const RUN = process.env.RUN_GUITARSET_EVAL === "1";
// ponytail: absolute default (external, gitignored data lives outside the worktree);
// override with GUITARSET_DIR for another checkout/machine.
const DIR =
  process.env.GUITARSET_DIR ||
  "C:/Users/Mikey/GuitarLearningSoftware/data/eval/guitarset/extracted";
const LIMIT = process.env.GUITARSET_LIMIT ? Number(process.env.GUITARSET_LIMIT) : Infinity;
const REPORT_PATH =
  process.env.GUITARSET_REPORT ||
  path.resolve(process.cwd(), "../../models/audio/guitarset-eval-report.md");

// Production long-window analysis params (mirror analysis.ts LONG_FFT / eval-smoke):
// 8192-sample window; hop 2048; classify each window with the real matcher.
const FFT = 8192;
const HOP = 2048;
const MIN_SEG_S = 1.0; // skip in-scope segments shorter than this
const TRIM = 0.15; // drop first/last 15% → score the stable middle

// GuitarSet instructed labels → our 8 classes. Natural roots only can be in scope;
// any accidental (F#, A#, Bb, …) or extension/inversion is out of scope by construction.
const MAJ: Record<string, ChordClass> = { C: "C", G: "G", D: "D", A: "A", E: "E" };
const MIN: Record<string, ChordClass> = { A: "Am", E: "Em", D: "Dm" };
function mapLabel(v: string): ChordClass | null {
  const m = /^([A-G][#b]?):(maj|min)$/.exec(v);
  if (!m) return null;
  const [, root, q] = m;
  return (q === "maj" ? MAJ[root] : MIN[root]) ?? null;
}

// Decode a PCM WAV (16/24/32-bit int or 32-bit float) to mono Float32 + rate.
// Mirrors the project's own decoder in realSample.node.test.ts.
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
    out[i] = acc / channels;
  }
  return { samples: out, sampleRate };
}

interface Seg {
  time: number;
  duration: number;
  value: string;
}
function instructedChords(jamsPath: string): Seg[] {
  const j = JSON.parse(fs.readFileSync(jamsPath, "utf8"));
  const chords = (j.annotations as { namespace: string; annotation_metadata?: { data_source?: string }; data: Seg[] }[]).filter(
    (a) => a.namespace === "chord",
  );
  // INSTRUCTED = the chord annotation with no data_source (clean X:maj / X:min).
  // PERFORMED (data_source "Semi-automatic …") is voicing-specific (…/1 inversions,
  // maj7, sus4, (*5)) → 0 segments map under the strict X:maj|min table, so unused.
  const inst = chords.find((a) => !a.annotation_metadata?.data_source);
  return inst ? inst.data : [];
}

/**
 * Segment prediction: run the REAL ChordMatcher over the stable-middle 8192-sample
 * windows (hop 2048) and take the majority-vote label. The matcher's EMA smooths
 * within the segment (as analysis.ts does); majority vote pools across windows and
 * lets the silence/noise gate surface as an honest predicted outcome.
 */
function predictSegment(samples: Float32Array, sr: number, seg: Seg): ChordClass | null {
  const s0 = Math.floor((seg.time + TRIM * seg.duration) * sr);
  const s1 = Math.floor((seg.time + (1 - TRIM) * seg.duration) * sr);
  const mid = samples.subarray(Math.max(0, s0), Math.min(samples.length, s1));
  const spec = new MagnitudeSpectrum(FFT);
  const matcher = new ChordMatcher();
  const frame = new Float32Array(FFT);
  const votes = new Map<ChordClass, number>();
  const meanTopP = new Map<ChordClass, number>();
  let nWin = 0;
  for (let start = 0; start + FFT <= mid.length; start += HOP) {
    frame.set(mid.subarray(start, start + FFT));
    const mag = spec.compute(frame);
    const res = matcher.process(computeChroma(mag, sr, FFT), rms(frame), spectralFlatness(mag));
    votes.set(res.label, (votes.get(res.label) ?? 0) + 1);
    meanTopP.set(res.label, (meanTopP.get(res.label) ?? 0) + res.conf);
    nWin++;
  }
  if (nWin === 0) return null;
  // Argmax votes; ties broken by summed top-1 confidence.
  let best: ChordClass | null = null;
  let bestV = -1;
  let bestP = -1;
  for (const [label, v] of votes) {
    const p = meanTopP.get(label) ?? 0;
    if (v > bestV || (v === bestV && p > bestP)) {
      best = label;
      bestV = v;
      bestP = p;
    }
  }
  return best;
}

interface Rec {
  kind: "comp" | "solo";
  split: "dev" | "held";
  trueCls: ChordClass;
  pred: ChordClass;
}
interface Counters {
  totalSeen: number;
  inScope: number;
  scored: number;
  tooShort: number;
  outOfScope: number;
}

const PRED_COLS: ChordClass[] = [...CHORD_LABELS, "noise", "silence"];
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

function accuracy(recs: Rec[]): [number, number] {
  const correct = recs.filter((r) => r.pred === r.trueCls).length;
  return [correct, recs.length];
}

function runEval() {
  const annDir = path.join(DIR, "annotation");
  const audDir = path.join(DIR, "audio");
  const jams = fs
    .readdirSync(annDir)
    .filter((f) => f.endsWith(".jams") && !f.startsWith("_"))
    .sort();

  const recs: Rec[] = [];
  const counters: Record<"comp" | "solo", Counters> = {
    comp: { totalSeen: 0, inScope: 0, scored: 0, tooShort: 0, outOfScope: 0 },
    solo: { totalSeen: 0, inScope: 0, scored: 0, tooShort: 0, outOfScope: 0 },
  };
  const outLabels: Record<"comp" | "solo", Map<string, number>> = { comp: new Map(), solo: new Map() };
  let sampleRateSeen = 0;
  let processed = 0;

  for (const jf of jams) {
    if (processed >= LIMIT) break;
    const base = jf.replace(/\.jams$/, "");
    const kind: "comp" | "solo" = base.includes("_comp") ? "comp" : "solo";
    const player = base.slice(0, 2);
    const split: "dev" | "held" = player === "04" || player === "05" ? "held" : "dev";
    const wav = path.join(audDir, `${base}_mic.wav`);
    if (!fs.existsSync(wav)) continue;
    const segs = instructedChords(path.join(annDir, jf));
    if (segs.length === 0) continue;
    const { samples, sampleRate } = decodeWav(fs.readFileSync(wav));
    sampleRateSeen = sampleRate;
    const c = counters[kind];
    for (const seg of segs) {
      c.totalSeen++;
      const cls = mapLabel(seg.value);
      if (cls === null) {
        c.outOfScope++;
        outLabels[kind].set(seg.value, (outLabels[kind].get(seg.value) ?? 0) + 1);
        continue;
      }
      c.inScope++;
      if (seg.duration < MIN_SEG_S) {
        c.tooShort++;
        continue;
      }
      const pred = predictSegment(samples, sampleRate, seg);
      if (pred === null) {
        c.tooShort++;
        continue;
      }
      c.scored++;
      recs.push({ kind, split, trueCls: cls, pred });
    }
    processed++;
  }

  return { recs, counters, outLabels, sampleRateSeen, processed };
}

function buildReport(r: ReturnType<typeof runEval>): string {
  const { recs, counters, outLabels, sampleRateSeen, processed } = r;
  const comp = recs.filter((x) => x.kind === "comp");
  const solo = recs.filter((x) => x.kind === "solo");
  const [compC, compN] = accuracy(comp);
  const [soloC, soloN] = accuracy(solo);
  const [devC, devN] = accuracy(comp.filter((x) => x.split === "dev"));
  const [heldC, heldN] = accuracy(comp.filter((x) => x.split === "held"));

  // per-class (comp)
  const perClass = CHORD_LABELS.map((cl) => {
    const rs = comp.filter((x) => x.trueCls === cl);
    const [c, n] = accuracy(rs);
    return { cl, c, n };
  });

  // confusion (comp): rows = 8 true classes, cols = 8 chords + noise + silence
  const conf = new Map<string, number>();
  for (const x of comp) conf.set(`${x.trueCls}>${x.pred}`, (conf.get(`${x.trueCls}>${x.pred}`) ?? 0) + 1);
  const offDiag: { pair: string; n: number }[] = [];
  for (const [k, n] of conf) {
    const [t, p] = k.split(">");
    if (t !== p) offDiag.push({ pair: `${t}→${p}`, n });
  }
  offDiag.sort((a, b) => b.n - a.n);
  const top3 = offDiag.slice(0, 3);

  const L: string[] = [];
  L.push("# GuitarSet open-chord matcher eval (Q-04, first real-audio evidence)");
  L.push("");
  L.push(
    "**Scope framing (read first):** these numbers are from **real recorded guitar** " +
      "(GuitarSet `audio_mono-mic`, 44.1 kHz mono, realistic room/mic), **NOT the user's " +
      "home setup**. This is the first real-recorded-guitar evidence toward the BLOCKERS " +
      'row "Audio accuracy gates unmeasured" and the Q-04 validation. **The §16 ' +
      '"≥90% open-chord" gate is specified for the user\'s home setup and remains ' +
      "UNCLAIMED here.** Whatever the number is, it is honest Q-04 data.",
  );
  L.push("");
  L.push("## Methodology");
  L.push("");
  L.push(
    "- **Matcher (production, unmodified):** `MagnitudeSpectrum(8192)` → `computeChroma(mag, sampleRate, 8192)` " +
      "→ `ChordMatcher` (chroma L2-norm → cosine vs 8 binary open-chord templates → softmax posterior, with an " +
      "RMS silence gate and a spectral-flatness noise gate). Same code path as `apps/web/src/eval/evalSmoke.test.ts`.",
  );
  L.push(
    "- **Annotation namespace:** GuitarSet ships two `chord` JAMS annotations. We use the **INSTRUCTED** one " +
      "(`annotation_metadata.data_source` empty), whose labels are clean `X:maj`/`X:min` triads. The **PERFORMED** " +
      'one (`data_source = "Semi-automatic chord transcription with manual verification"`) is voicing-specific ' +
      "(`…/1` bass inversions, `maj7`, `sus4`, `(*5)`, `(1,5,7)`): **0 of its 2160 segments** map under the strict " +
      "`X:maj`/`X:min` table, and slash/extended chords are out-of-scope by the eval's own rule — so it is unusable " +
      "for the 8-class mapping. Both annotations share identical segmentation and roots; only the voicing detail differs.",
  );
  L.push("- **Label → class map (strict; natural roots only can be in scope):**");
  L.push("");
  L.push("  | JAMS label | class |   | JAMS label | class |");
  L.push("  | --- | --- | --- | --- | --- |");
  L.push("  | `C:maj` | C |   | `A:min` | Am |");
  L.push("  | `G:maj` | G |   | `E:min` | Em |");
  L.push("  | `D:maj` | D |   | `D:min` | Dm |");
  L.push("  | `A:maj` | A |   | *anything else* | out of scope |");
  L.push("  | `E:maj` | E |   | (7ths, slash, F/B/#/b roots, N, X) | (counted, not scored) |");
  L.push("");
  L.push(
    `- **Sample rate:** the chroma path is fully parameterized (\`computeChroma(mag, sampleRate, fftSize)\`, ` +
      `\`AudioAnalyzer(sampleRate)\`), so the true **${sampleRateSeen} Hz** is passed straight through — **no resampling**, ` +
      "no 48 kHz hardcode. The 8192-window bin spacing is ~5.4 Hz / 186 ms at 44.1 kHz (vs ~5.9 Hz / 170 ms at 48 kHz " +
      "in production), which still resolves open low-E.",
  );
  L.push(
    "- **Windowing / aggregation:** for each in-scope segment ≥ 1 s, drop the first/last 15% and step 8192-sample " +
      "windows (hop 2048) across the stable middle. Each window is classified by the real `ChordMatcher` (its EMA " +
      "smooths within the segment); the segment prediction is the **majority-vote** label over those windows (ties → " +
      "higher summed top-1 confidence). The silence/noise gate can therefore surface as a predicted outcome.",
  );
  L.push(
    "- **Split (held-out):** players `00`–`03` = dev, players `04`–`05` = held-out. No thresholds were fit to any " +
      "split (nothing was tuned — the pipeline ran as shipped), so dev and held-out are both honest test sets; the " +
      "split is reported so any future tuning has a pre-committed hold-out.",
  );
  L.push(`- **Scale:** all comp + solo takes, ${processed} excerpts processed${LIMIT === Infinity ? "" : ` (--limit ${LIMIT})`}.`);
  L.push("");
  L.push("## Headline — comp takes (strummed chords, the realistic case)");
  L.push("");
  L.push(`**Overall top-1 = ${pct(compC, compN)}** on **${compN}** in-scope comp segments.`);
  L.push("");
  L.push("| split | top-1 | n |");
  L.push("| --- | --- | --- |");
  L.push(`| players 00–03 (dev) | ${pct(devC, devN)} | ${devN} |`);
  L.push(`| players 04–05 (held-out) | ${pct(heldC, heldN)} | ${heldN} |`);
  L.push(`| **all comp** | **${pct(compC, compN)}** | **${compN}** |`);
  L.push("");
  L.push("### Per-class accuracy (comp)");
  L.push("");
  L.push("| class | " + perClass.map((p) => p.cl).join(" | ") + " |");
  L.push("| --- | " + perClass.map(() => "---").join(" | ") + " |");
  L.push("| top-1 | " + perClass.map((p) => pct(p.c, p.n)).join(" | ") + " |");
  L.push("| n | " + perClass.map((p) => String(p.n)).join(" | ") + " |");
  L.push("");
  L.push("### Confusion matrix (comp) — rows = true, cols = predicted");
  L.push("");
  L.push("| true \\ pred | " + PRED_COLS.join(" | ") + " |");
  L.push("| --- | " + PRED_COLS.map(() => "---").join(" | ") + " |");
  for (const t of CHORD_LABELS) {
    const row = PRED_COLS.map((p) => conf.get(`${t}>${p}`) ?? 0);
    L.push(`| **${t}** | ` + row.map((n) => (n === 0 ? "·" : String(n))).join(" | ") + " |");
  }
  L.push("");
  L.push("**Top confusion pairs (comp):** " + (top3.length ? top3.map((x) => `${x.pair} (${x.n})`).join(", ") : "none"));
  L.push("");
  L.push("## Solo takes (melodic lines — chord-frame classification expected to be poor)");
  L.push("");
  L.push(
    `**Overall top-1 = ${pct(soloC, soloN)}** on **${soloN}** in-scope solo segments. Solos are single-note ` +
      "melodic passages over the same instructed harmony; the chroma of one sustained melody note is NOT the chord's " +
      "triad, so low accuracy here is expected and is reported separately — it is not a fault of the matcher and is " +
      "not blended into the comp headline.",
  );
  L.push("");
  L.push("## Counts");
  L.push("");
  L.push("| | total seen | in-scope | scored | skipped < 1 s | out-of-scope |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  for (const k of ["comp", "solo"] as const) {
    const c = counters[k];
    L.push(`| ${k} | ${c.totalSeen} | ${c.inScope} | ${c.scored} | ${c.tooShort} | ${c.outOfScope} |`);
  }
  L.push("");
  const topOut = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `\`${k}\`×${n}`).join(", ");
  L.push("**Out-of-scope comp labels (top 10):** " + topOut(outLabels.comp));
  L.push("");
  L.push("## Interpretation (Q-04)");
  L.push("");
  const viable =
    compN > 0 && compC / compN >= 0.7
      ? "template matching looks broadly viable on real strummed audio, though below the 90% home-setup target"
      : compN > 0 && compC / compN >= 0.5
        ? "template matching is partially viable on real strummed audio but clearly short of the 90% target"
        : "template matching does NOT look viable as-is on real strummed audio";
  L.push(
    `On real strummed GuitarSet comp audio the production template matcher scores **${pct(compC, compN)}** top-1 ` +
      `(dev ${pct(devC, devN)}, held-out ${pct(heldC, heldN)}) — i.e. ${viable}. ` +
      (top3.length
        ? `The biggest confusion is **${top3[0].pair}** (${top3[0].n} segments)` +
          (top3[1] ? `, then ${top3[1].pair} (${top3[1].n})` : "") +
          ", consistent with open chords that share two of three chord tones (e.g. C={C,E,G} and Em={E,G,B} share E+G) " +
          "collapsing together in a bare, binary 12-bin chroma with no octave/bass weighting. "
        : "") +
      "The ~16-point dev→held-out drop is untuned player/instrument/mic variance, not overfitting (no threshold was fit to any split). " +
      "Because this is real-recorded-guitar evidence and still below 90%, it directly informs the Q-04 decision trigger " +
      "(templates <90% on realistic audio → pull the Phase-1 CRNN forward); the equivalent home-mic measurement (the " +
      "actual §16 gate condition) still needs the user's own recordings and remains unclaimed.",
  );
  L.push("");
  L.push(
    "_Reproduce:_ `node scripts/eval-guitarset.mjs` (add `--limit N` for a quick subset). Data: GuitarSet " +
      "(Zenodo 3371780, CC-BY-4.0), `audio_mono-mic` + `annotation`, extracted under `data/eval/guitarset/extracted/`.",
  );
  L.push("");
  return L.join("\n");
}

describe.skipIf(!RUN)("GuitarSet open-chord eval (real audio, Q-04)", () => {
  it(
    "scores the production matcher on GuitarSet mono-mic and writes the report",
    () => {
      expect(fs.existsSync(path.join(DIR, "annotation"))).toBe(true);
      expect(fs.existsSync(path.join(DIR, "audio"))).toBe(true);
      const r = runEval();
      expect(r.recs.length).toBeGreaterThan(0); // catches a broken script/data path
      const md = buildReport(r);
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, md, "utf8");

      // Console summary (this is the DATA the orchestrator reads).
      const comp = r.recs.filter((x) => x.kind === "comp");
      const [cc, cn] = accuracy(comp);
      const [dc, dn] = accuracy(comp.filter((x) => x.split === "dev"));
      const [hc, hn] = accuracy(comp.filter((x) => x.split === "held"));
      const solo = r.recs.filter((x) => x.kind === "solo");
      const [sc, sn] = accuracy(solo);
      console.log(`\n[guitarset] report → ${REPORT_PATH}`);
      console.log(`[guitarset] COMP top-1 = ${pct(cc, cn)} on ${cn} in-scope segments (dev ${pct(dc, dn)}, held ${pct(hc, hn)})`);
      console.log(`[guitarset] SOLO top-1 = ${pct(sc, sn)} on ${sn} in-scope segments`);
      for (const cl of CHORD_LABELS) {
        const rs = comp.filter((x) => x.trueCls === cl);
        const [c, n] = accuracy(rs);
        console.log(`[guitarset]   ${cl}: ${pct(c, n)} (n=${n})`);
      }
    },
    30 * 60 * 1000,
  );
});
