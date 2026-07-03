import { describe, it, expect } from "vitest";
import { validateStrings, type ExpectedString } from "./stringValidation";

// C major open voicing (x32010): A3rd→C3(48), D2nd→E3(52), G open→G3(55),
// B1st→C4(60), e open→E4(64). STANDARD convention 1(high e)…6(low E); the low
// E (6th) is muted. Matches docs §9.4 fingering (index→str2, middle→str4,
// ring→str5).
const C_MAJOR: ExpectedString[] = [
  { string: 5, midi: 48 }, // C3  — A string (5th), 3rd fret
  { string: 4, midi: 52 }, // E3  — D string (4th), 2nd fret
  { string: 3, midi: 55 }, // G3  — G string (3rd), open
  { string: 2, midi: 60 }, // C4  — B string (2nd), 1st fret
  { string: 1, midi: 64 }, // E4  — high e (1st), open
];

describe("string-level validation", () => {
  it("passes clean when all expected notes are heard (octave-tolerant)", () => {
    const detected = [48, 52, 55, 60, 64];
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).toEqual([]);
    expect(v.extra).toEqual([]);
    expect(v.possiblyMuted).toEqual([]);
  });

  it("does not falsely flag a dropped string whose pitch class is doubled", () => {
    // High-E (E4, string 1) not heard, but E3 (string 4) still sounds, so the E
    // pitch class is present elsewhere — audio alone can't attribute the mute,
    // so it is neither `missing` (pc heard) nor a strong `possiblyMuted` flag.
    // This ambiguity is exactly what the vision leg (WP-3) later disambiguates.
    const detected = [48, 52, 55, 60];
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).not.toContain(1);
    expect(v.possiblyMuted).not.toContain(1);
  });

  it("flags a possibly-muted string when its pitch class is unique", () => {
    // Drop G3 (string 3) — G appears on no other expected string → strong flag.
    const detected = [48, 52, 60, 64];
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).toContain(3);
    expect(v.possiblyMuted).toContain(3);
  });

  it("reports an extra out-of-chord note", () => {
    const detected = [48, 52, 55, 60, 64, 58]; // 58 = A#3, not in C major
    const v = validateStrings(C_MAJOR, detected);
    expect(v.extra).toContain(58);
  });

  it("matches across octaves by pitch class", () => {
    const detected = [36, 52, 55, 60, 64]; // C2 instead of C3 — same pc
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).not.toContain(5); // C is on the A string (5th, standard)
  });
});
