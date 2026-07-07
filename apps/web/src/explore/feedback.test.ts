import { describe, expect, it } from "vitest";
import { ExploreFeedback, HOLD_MS, LIGHT_CONF, SCALE_PC_FALLBACK } from "./feedback";
import type { ExploreTarget } from "./exploreStore";

const AM: ExploreTarget = {
  kind: "chord", root: "A", suffix: "minor", active: 0,
  voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
};
// Two G-major positions with distinct pitch classes: G2 (root, midi 43) and A2 (midi 45).
const GMAJ: ExploreTarget = {
  kind: "scale", root: "G", scaleType: "major",
  positions: [
    { string: 6, fret: 3, midi: 43, note: "G2", degree: "1", isRoot: true },
    { string: 5, fret: 0, midi: 45, note: "A2", degree: "2", isRoot: false },
  ],
};

describe("ExploreFeedback", () => {
  it("light: chord label match above LIGHT_CONF holds for HOLD_MS", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: LIGHT_CONF + 0.1, t: 1000 }], 1000);
    expect(f.heard(AM, "light", 1000).chordHeard).toBe(true);
    expect(f.heard(AM, "light", 1000 + HOLD_MS - 1).chordHeard).toBe(true);
    expect(f.heard(AM, "light", 1000 + HOLD_MS + 1).chordHeard).toBe(false);
  });
  it("light: below-confidence or wrong label does not trigger", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: 0.2, t: 0 }], 0);
    f.ingest([{ kind: "chord", label: "E", conf: 0.9, t: 0 }], 0);
    expect(f.heard(AM, "light", 0).chordHeard).toBe(false);
  });
  it("full: per-string midi matching against the voicing", () => {
    const f = new ExploreFeedback();
    // Am open expected midi (string 1..6): e4=64, C4=60, A3=57, E3=52, A2=45, muted
    // Real notes AudioEvent shape (§9.1): { kind:"notes", pitches:number[], conf, t }.
    f.ingest([{ kind: "notes", pitches: [60, 45], conf: 0.9, t: 500 }], 500);
    const h = f.heard(AM, "full", 600);
    expect(h.strings).toEqual(["pending", "ok", "pending", "pending", "ok", "muted-expected"]);
  });
  it("scale + full: exact-octave hit fills scaleHitMidis within HOLD_MS, drops after", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "notes", pitches: [43], conf: 0.9, t: 100 }], 100);
    const h = f.heard(GMAJ, "full", 200);
    expect(h.scaleHitMidis).toContain(43);
    expect(h.scaleHitMidis).not.toContain(45);
    expect(f.heard(GMAJ, "full", 100 + HOLD_MS + 1).scaleHitMidis).not.toContain(43);
  });
  it("scale + full: pitch-class fallback lights the position from another octave", () => {
    expect(SCALE_PC_FALLBACK).toBe(true); // decision pinned; see feedback.ts comment
    const f = new ExploreFeedback();
    f.ingest([{ kind: "notes", pitches: [55], conf: 0.9, t: 0 }], 0); // G3, octave above the G2 position
    const h = f.heard(GMAJ, "full", 10);
    expect(h.scaleHitMidis).toContain(43);
    expect(h.scaleHitMidis).not.toContain(45);
  });
  it("scale + light tier carries no scaleHitMidis", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "notes", pitches: [43], conf: 0.9, t: 0 }], 0);
    expect(f.heard(GMAJ, "light", 10).scaleHitMidis).toBeUndefined();
  });
  it("full with no note evidence degrades to all-pending, chordHeard still works", () => {
    const f = new ExploreFeedback();
    f.ingest([{ kind: "chord", label: "Am", conf: 0.9, t: 0 }], 0);
    const h = f.heard(AM, "full", 10);
    expect(h.chordHeard).toBe(true);
    expect(h.strings).toEqual(["pending", "pending", "pending", "pending", "pending", "muted-expected"]);
  });
});
