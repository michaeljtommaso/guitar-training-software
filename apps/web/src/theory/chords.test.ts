import { describe, expect, it } from "vitest";
import { CHORD_ROOTS, chordVoicings, convertPosition } from "./chords";

describe("chords-db adapter", () => {
  it("converts db order (low-E-first) to project order (high-e-first) — C major open", () => {
    // db C major open: frets [x,3,2,0,1,0] low-E-first, baseFret 1
    const v = convertPosition({ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], barres: [], baseFret: 1 });
    expect(v.frets).toEqual([0, 1, 0, 2, 3, -1]);   // string 1 (high e) first
    expect(v.fingers).toEqual([0, 1, 0, 2, 3, 0]);
    expect(v.baseFret).toBe(1);
  });
  it("makes shifted-shape frets and barres ABSOLUTE — C#m style @ baseFret 4", () => {
    const v = convertPosition({ frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barres: [1], baseFret: 4 });
    // absolute = rel + baseFret - 1 → [4,6,6,5,4,4] low-E-first → reversed
    expect(v.frets).toEqual([4, 4, 5, 6, 6, 4]);
    expect(v.barres).toEqual([4]);
    expect(v.window[0]).toBe(3); // baseFret-1
  });
  it("loads real Am voicings, open shape first (difficulty sort)", async () => {
    const vs = await chordVoicings("A", "minor");
    expect(vs.length).toBeGreaterThan(1);
    expect(vs[0].baseFret).toBe(1);
    expect(vs[0].barres).toEqual([]);
    // open Am: x02210 low-E-first → ours [0,1,2,2,0,-1]
    expect(vs[0].frets).toEqual([0, 1, 2, 2, 0, -1]);
  });
  it("resolves sharp roots and unknown chords", async () => {
    expect((await chordVoicings("C#", "minor")).length).toBeGreaterThan(0);
    // Probe delta: the db keys D#/G#/A# as flats (Eb/Ab/Bb), not "Dsharp" style.
    expect((await chordVoicings("D#", "minor")).length).toBeGreaterThan(0);
    expect((await chordVoicings("G#", "major")).length).toBeGreaterThan(0);
    expect((await chordVoicings("A#", "major")).length).toBeGreaterThan(0);
    expect(await chordVoicings("C", "nonsense-suffix")).toEqual([]);
  });
  it("exports 12 roots", () => {
    expect(CHORD_ROOTS).toHaveLength(12);
    expect(CHORD_ROOTS).toContain("C#");
  });
});
