// Lessons-as-data tests: every shipped lesson passes the Zod read gate, the
// C-major data uses STANDARD string numbering (avoid = low E = 6), and — the
// WP-4 gate — changing ONLY lesson data changes the engine's diagnosis with
// zero engine-code change.
import { describe, expect, it } from "vitest";
import { lessons, getLesson, parseLesson, expectedNotes, openMidi, type Lesson } from "./lessons";
import { FusionEngine } from "./engine";
import type { Diagnosis } from "./diagnosis";

describe("lessons-as-data: tone_preset (TP-2 Task 11)", () => {
  it("parses a lesson with tone_preset", () => {
    const raw = structuredClone(getLesson("open_chords_c_major")!) as Record<string, unknown>;
    raw.tone_preset = "Clean Chord Practice";
    expect(parseLesson(raw).tone_preset).toBe("Clean Chord Practice");
  });

  it("parses a lesson without tone_preset (unchanged behavior)", () => {
    const raw = structuredClone(getLesson("open_chords_g_major") ?? getLesson("open_chords_d_major")!);
    expect(parseLesson(raw).tone_preset).toBeUndefined();
  });

  it("rejects a non-string tone_preset", () => {
    const raw = structuredClone(getLesson("open_chords_c_major")!) as Record<string, unknown>;
    raw.tone_preset = 5;
    expect(() => parseLesson(raw)).toThrow();
  });

  it("ships tone_preset on the C major lesson only", () => {
    expect(getLesson("open_chords_c_major")!.tone_preset).toBe("Clean Chord Practice");
    const others = lessons.filter((l) => l.id !== "open_chords_c_major");
    expect(others.every((l) => l.tone_preset === undefined)).toBe(true);
  });
});

describe("lessons-as-data (Zod read gate)", () => {
  it("ships the 8 open chords + 2 transition drills, all Zod-valid", () => {
    expect(lessons).toHaveLength(10);
    const chords = lessons.filter((l) => l.steps.length === 1).map((l) => l.steps[0].chord).sort();
    expect(chords).toEqual(["A", "Am", "C", "D", "Dm", "E", "Em", "G"]);
    const drills = lessons.filter((l) => l.steps.length > 1);
    expect(drills.map((d) => d.id).sort()).toEqual(["transition_am_em", "transition_c_g"]);
  });

  it("C major uses STANDARD numbering: avoid the LOW E (string 6), not string 1", () => {
    const c = getLesson("open_chords_c_major")!;
    expect(c.steps[0].avoid_strings).toEqual([6]);
    expect(c.steps[0].expected_strings).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects malformed lesson data (write/read gate)", () => {
    expect(() => parseLesson({ id: "x", title: "x", steps: [] })).toThrow();
    const c = structuredClone(getLesson("open_chords_c_major")!) as Record<string, unknown>;
    (c.steps as { avoid_strings: number[] }[])[0].avoid_strings = [1]; // overlaps expected
    expect(() => parseLesson(c)).toThrow();
  });

  it("derives exact expected MIDI notes from the fingering (open C = E4 C4 G3 E3 C3)", () => {
    const c = getLesson("open_chords_c_major")!;
    expect(expectedNotes(c.steps[0])).toEqual([
      { string: 1, midi: 64 }, // high e open
      { string: 2, midi: 60 }, // B fret 1 → C4
      { string: 3, midi: 55 }, // G open
      { string: 4, midi: 52 }, // D fret 2 → E3
      { string: 5, midi: 48 }, // A fret 3 → C3
    ]);
    expect(openMidi(6)).toBe(40); // low E
  });
});

describe("lessons-as-data gate: data-only change → different diagnosis, ZERO engine change", () => {
  // The same synthetic event stream, played against two lessons that differ
  // ONLY in data: shipped C major (low E avoided) vs a variant where the low
  // E is expected. Same engine code, different diagnosis.
  const stream: [unknown, "audio" | "vision"][] = [
    [{ t: 300, kind: "chord", label: "C", conf: 0.9 }, "audio"],
    [{ t: 600, kind: "chord", label: "C", conf: 0.9 }, "audio"],
    [{ t: 900, kind: "notes", pitches: [64, 60, 55, 52, 48], conf: 0.9 }, "audio"], // strings 1..5, NO low E
  ];

  function lastDiag(lesson: Lesson): Diagnosis {
    const engine = new FusionEngine(lesson);
    const out: Diagnosis[] = [];
    for (const [ev, leg] of stream) out.push(...engine.ingest(ev, leg));
    return out.at(-1)!;
  }

  it("shipped data: low E avoided → the stream is diagnosed ok", () => {
    expect(lastDiag(getLesson("open_chords_c_major")!).code).toBe("ok");
  });

  it("edited data (avoid_strings/expected_strings only) → same stream now diagnosed missing_note", () => {
    const edited = structuredClone(getLesson("open_chords_c_major")!);
    edited.steps[0].expected_strings = [1, 2, 3, 4, 5, 6];
    edited.steps[0].avoid_strings = [];
    const lesson = parseLesson(edited); // same Zod read gate
    const d = lastDiag(lesson);
    expect(d.code).toBe("missing_note");
    expect(d.evidence.audio).toContain("low E");
  });
});
