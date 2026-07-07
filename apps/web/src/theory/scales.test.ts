import { describe, expect, it } from "vitest";
import { scalePositions } from "./scales";

describe("scalePositions", () => {
  it("G major on string 6 (low E), frets 0-12, is exactly the G major pitches", () => {
    const s6 = scalePositions("G", "major", { maxFret: 12 })
      .filter((p) => p.string === 6)
      .map((p) => ({ fret: p.fret, degree: p.degree }));
    // E2 string: F#(2)=7th, G(3)=root, A(5)=2, B(7)=3, C(8)=4, D(10)=5, E(0/12)=6
    expect(s6).toEqual([
      { fret: 0, degree: "6" }, { fret: 2, degree: "7" }, { fret: 3, degree: "1" },
      { fret: 5, degree: "2" }, { fret: 7, degree: "3" }, { fret: 8, degree: "4" },
      { fret: 10, degree: "5" }, { fret: 12, degree: "6" },
    ]);
  });
  it("flags roots and names notes", () => {
    const roots = scalePositions("G", "major", { maxFret: 12 }).filter((p) => p.isRoot);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((p) => p.note.startsWith("G"))).toBe(true);
    expect(roots.every((p) => p.degree === "1")).toBe(true);
  });
  it("A minor pentatonic, string 1 (high e), frets 0-12 — exact set", () => {
    const s1 = scalePositions("A", "pentatonic_minor", { maxFret: 12 })
      .filter((p) => p.string === 1).map((p) => p.fret);
    // e4 string pcs: A=5, C=8, D=10, E=0/12, G=3
    expect(s1).toEqual([0, 3, 5, 8, 10, 12]);
  });
  it("minor scale uses flat degree labels", () => {
    const degs = new Set(scalePositions("A", "minor").map((p) => p.degree));
    expect(degs).toEqual(new Set(["1", "2", "♭3", "4", "5", "♭6", "♭7"]));
  });
  it("sorted by string then fret; default maxFret 12", () => {
    const all = scalePositions("C", "blues");
    const sorted = [...all].sort((a, b) => a.string - b.string || a.fret - b.fret);
    expect(all).toEqual(sorted);
    expect(Math.max(...all.map((p) => p.fret))).toBeLessThanOrEqual(12);
  });
});
