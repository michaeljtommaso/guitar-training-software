// FusionEngine unit tests: the three canonical §9.2 resolutions on synthetic
// event streams, determinism (purity), and the Zod ingest boundary.
// All numbers here are SYNTHETIC — no accuracy claim is made or implied.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FusionEngine } from "./engine";
import { FeedbackPolicy } from "./feedbackPolicy";
import { getLesson } from "./lessons";
import type { Diagnosis } from "./diagnosis";

const cLesson = getLesson("open_chords_c_major")!;
const cgDrill = getLesson("transition_c_g")!;

// ── synthetic event builders (standard string numbering: 1 = high e) ────────
const calib = (t: number, conf = 0.9) => ({ t, kind: "calib", homographyConf: conf });
const chord = (t: number, label: string, conf: number) => ({ t, kind: "chord", label, conf });
const notes = (t: number, pitches: number[], conf = 0.9) => ({ t, kind: "notes", pitches, conf });
const onset = (t: number) => ({ t, kind: "onset", strength: 1, conf: 0.9 });
const assign = (finger: string, string: number, fret: number, conf = 0.9) => ({
  finger,
  string,
  fret,
  conf,
});
/** Canonical open-C shape (index 2/1, middle 4/2, ring 5/3). */
const cShapeCanonical = (t: number) => ({
  t,
  kind: "fingerAssign",
  assigns: [assign("index", 2, 1), assign("middle", 4, 2), assign("ring", 5, 3)],
});
/** Same C cells, different fingers — a valid alternate fingering. */
const cShapeAlternate = (t: number) => ({
  t,
  kind: "fingerAssign",
  assigns: [assign("index", 2, 1), assign("ring", 4, 2), assign("pinky", 5, 3)],
});
/** Canonical open-G shape (index 5/2, middle 6/3, ring 1/3). */
const gShape = (t: number) => ({
  t,
  kind: "fingerAssign",
  assigns: [assign("index", 5, 2), assign("middle", 6, 3), assign("ring", 1, 3)],
});

// Exact MIDI notes of open C (strings 5..1): C3 E3 G3 C4 E4.
const C_ALL = [48, 52, 55, 60, 64];
// Open C with the HIGH E (string 1, E4=64) absent — its pitch class still
// rings on string 4 (E3=52), so the absence is octave-ambiguous by design.
const C_NO_HIGH_E = [48, 52, 55, 60];

function run(engine: FusionEngine, events: [unknown, "audio" | "vision"][]): Diagnosis[] {
  const out: Diagnosis[] = [];
  for (const [ev, leg] of events) out.push(...engine.ingest(ev, leg));
  return out;
}

describe("FusionEngine — canonical §9.2 resolutions (synthetic streams)", () => {
  it("case a: vision shape close + audio missing the high e → missing_note citing both legs", () => {
    const engine = new FusionEngine(cLesson);
    const diags = run(engine, [
      [calib(0), "vision"],
      [cShapeCanonical(100), "vision"],
      [chord(300, "C", 0.7), "audio"],
      [notes(600, C_NO_HIGH_E, 0.8), "audio"],
    ]);
    const d = diags.at(-1)!;
    expect(d.code).toBe("missing_note");
    expect(d.evidence.audio).toContain("high e");
    expect(d.evidence.vision).toContain("shape matches C");
    expect(d.conf).toBeGreaterThan(0.5); // both legs → confident, not hedged

    // Phrasing (§9.2): "shape close; let the high E ring".
    const policy = new FeedbackPolicy();
    policy.setPriority(cLesson.steps[0].feedback_priority);
    const hint = policy.push(d)!;
    expect(hint).not.toBeNull();
    expect(hint.text).toBe("Shape close — let the high e ring");
    expect(hint.hedged).toBe(false);
  });

  it("case b: audio fully correct + non-canonical fingering → NO correction (ok, at most a low-severity nudge)", () => {
    const engine = new FusionEngine(cLesson);
    const diags = run(engine, [
      [calib(0), "vision"],
      [chord(300, "C", 0.9), "audio"],
      [chord(600, "C", 0.9), "audio"],
      [cShapeAlternate(700), "vision"],
      [notes(900, C_ALL, 0.9), "audio"],
    ]);
    const d = diags.at(-1)!;
    expect(d.code).toBe("ok"); // never a correction on vision alone
    expect(d.severity).toBeLessThanOrEqual(0.2); // low-severity nudge flag at most
    expect(d.evidence.vision).toContain("valid alternate");

    const policy = new FeedbackPolicy();
    policy.setPriority(cLesson.steps[0].feedback_priority);
    expect(policy.push(d)).toBeNull(); // ok never becomes a hint
  });

  it("case c: step change, audio chord ~240 ms late + hand late → late_strum with prepare-earlier evidence", () => {
    const engine = new FusionEngine(cgDrill);
    // Playing C on step 0, then the drill advances to G at t=10000.
    run(engine, [
      [calib(0), "vision"],
      [chord(9000, "C", 0.8), "audio"],
    ]);
    engine.beginStep(1, 10000);
    const diags = run(engine, [
      [chord(10240, "G", 0.8), "audio"], // 240 ms after the step change
      [gShape(10310), "vision"], // hand settles late too
      [onset(10600), "audio"],
    ]);
    const late = diags.find((d) => d.code === "late_strum")!;
    expect(late).toBeDefined();
    expect(late.evidence.audio).toContain("240 ms");
    expect(late.evidence.vision).toContain("prepare the shape earlier");
    expect(late.target.chord).toBe("G");

    const policy = new FeedbackPolicy();
    policy.setPriority(cgDrill.steps[1].feedback_priority);
    const hint = policy.push(late)!;
    expect(hint.text).toContain("Prepare the G shape earlier");
  });

  it("on-time transition resolves with NO late_strum", () => {
    const engine = new FusionEngine(cgDrill);
    run(engine, [[chord(9000, "C", 0.8), "audio"]]);
    engine.beginStep(1, 10000);
    const diags = run(engine, [
      [chord(10100, "G", 0.8), "audio"], // 100 ms < lateStrumMs
      [gShape(10150), "vision"],
      [onset(10600), "audio"],
    ]);
    expect(diags.some((d) => d.code === "late_strum")).toBe(false);
  });
});

describe("FusionEngine — silence/noise gate (BUG-001 / RESULT-002 Problem 1)", () => {
  it("silence AND noise chord events produce NO diagnoses (no phantom coaching)", () => {
    const engine = new FusionEngine(cLesson);
    const diags = run(engine, [
      [chord(300, "silence", 1), "audio"],
      [chord(600, "noise", 1), "audio"],
      [chord(900, "silence", 1), "audio"],
      [chord(1200, "noise", 1), "audio"],
      [onset(1500), "audio"],
    ]);
    expect(diags).toHaveLength(0);
  });

  it("a real off-target chord after noise is still diagnosed (gate is not over-broad)", () => {
    const engine = new FusionEngine(cLesson); // target chord C
    const diags = run(engine, [
      [chord(300, "noise", 1), "audio"],
      [chord(600, "G", 0.8), "audio"],
      [chord(900, "G", 0.8), "audio"],
    ]);
    expect(diags.some((d) => d.code === "missing_note")).toBe(true);
  });
});

describe("FusionEngine — determinism and the Zod ingest boundary", () => {
  const sequence: [unknown, "audio" | "vision"][] = [
    [calib(0), "vision"],
    [cShapeCanonical(100), "vision"],
    [chord(300, "C", 0.7), "audio"],
    [{ garbage: true }, "audio"], // malformed — must be dropped + counted
    [notes(600, C_NO_HIGH_E, 0.8), "audio"],
    [onset(900), "audio"],
    [{ t: 950, kind: "chord", label: "C" }, "audio"], // missing conf — dropped
    [notes(1200, C_ALL, 0.9), "audio"],
    [chord(1500, "C", 0.9), "audio"],
  ];

  it("same event sequence in → same diagnosis sequence out", () => {
    const a = run(new FusionEngine(cLesson), sequence);
    const b = run(new FusionEngine(cLesson), sequence);
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("malformed events are dropped and counted, never crash, never diagnose", () => {
    const engine = new FusionEngine(cLesson);
    expect(engine.ingest(null, "audio")).toEqual([]);
    expect(engine.ingest(42, "vision")).toEqual([]);
    expect(engine.ingest({ t: 1, kind: "nope" }, "audio")).toEqual([]);
    expect(engine.ingest({ t: 2, kind: "chord", label: "C", conf: 7 }, "audio")).toEqual([]);
    expect(engine.ingest({ t: 3, kind: "fingerAssign", assigns: [{ finger: "fist" }] }, "vision")).toEqual([]);
    expect(engine.stats.dropped).toBe(5);
  });

  it("engine source contains no wall-clock, timer, or randomness tokens (purity guard)", () => {
    // vitest root = apps/web (import.meta.url is not a file: URL under jsdom).
    const src = readFileSync(resolve(process.cwd(), "src/fusion/engine.ts"), "utf8");
    expect(src).not.toMatch(/Date\.now|Math\.random|performance\.|setTimeout|setInterval|requestAnimationFrame/);
  });
});
