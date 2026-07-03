import { describe, it, expect } from "vitest";
import { validateStrings, type ExpectedString } from "./stringValidation";

// C major open voicing: A3rd→C3(48), D2nd→E3(52), G open→G3(55),
// B1st→C4(60), e open→E4(64). Strings numbered 1(lowE)…6(highE); low E muted.
const C_MAJOR: ExpectedString[] = [
  { string: 2, midi: 48 }, // C3
  { string: 3, midi: 52 }, // E3
  { string: 4, midi: 55 }, // G3
  { string: 5, midi: 60 }, // C4
  { string: 6, midi: 64 }, // E4
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
    // High-E (E4, string 6) not heard, but E3 (string 3) still sounds, so the E
    // pitch class is present elsewhere — audio alone can't attribute the mute,
    // so it is neither `missing` (pc heard) nor a strong `possiblyMuted` flag.
    // This ambiguity is exactly what the vision leg (WP-3) later disambiguates.
    const detected = [48, 52, 55, 60];
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).not.toContain(6);
    expect(v.possiblyMuted).not.toContain(6);
  });

  it("flags a possibly-muted string when its pitch class is unique", () => {
    // Drop G3 (string 4) — G appears on no other expected string → strong flag.
    const detected = [48, 52, 60, 64];
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).toContain(4);
    expect(v.possiblyMuted).toContain(4);
  });

  it("reports an extra out-of-chord note", () => {
    const detected = [48, 52, 55, 60, 64, 58]; // 58 = A#3, not in C major
    const v = validateStrings(C_MAJOR, detected);
    expect(v.extra).toContain(58);
  });

  it("matches across octaves by pitch class", () => {
    const detected = [36, 52, 55, 60, 64]; // C2 instead of C3 — same pc
    const v = validateStrings(C_MAJOR, detected);
    expect(v.missing).not.toContain(2);
  });
});
