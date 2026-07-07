import { describe, expect, it } from "vitest";
import { STANDARD_TUNING_MIDI, noteToPc, pcToName, midiPc, midiToName } from "./notes";

describe("notes", () => {
  it("standard tuning is high-e-first (project string numbering)", () => {
    expect(STANDARD_TUNING_MIDI).toEqual([64, 59, 55, 50, 45, 40]); // e4 B3 G3 D3 A2 E2
  });
  it("maps names to pitch classes incl. enharmonics", () => {
    expect(noteToPc("C")).toBe(0);
    expect(noteToPc("C#")).toBe(1);
    expect(noteToPc("Db")).toBe(1);
    expect(noteToPc("Bb")).toBe(10);
    expect(noteToPc("E#")).toBe(5);
  });
  it("throws on garbage", () => {
    expect(() => noteToPc("H")).toThrow();
    expect(() => noteToPc("")).toThrow();
  });
  it("pcToName honors flat preference", () => {
    expect(pcToName(1)).toBe("C#");
    expect(pcToName(1, true)).toBe("Db");
  });
  it("midi helpers", () => {
    expect(midiPc(40)).toBe(4);        // E2 → E
    expect(midiToName(40)).toBe("E2");
    expect(midiToName(64)).toBe("E4");
    expect(midiToName(61)).toBe("C#4");
  });
});
