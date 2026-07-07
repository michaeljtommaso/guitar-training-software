// Pure advice mapping from measured round-trip latency (ms) to a plain-
// language tier + message for the Setup Wizard. See docs/research/
// amp-modeling-and-tone-engine-research.md ("Good target: <10-12 ms round
// trip for amp monitoring") for the 12 ms boundary and RESULT-003 (52 ms
// observation on a built-in mic) for the >30 ms "echo" tier.
import { describe, expect, it } from "vitest";
import { adviseLatency, GREAT_MAX_MS, USABLE_MAX_MS } from "./latencyAdvice";

describe("adviseLatency", () => {
  it("returns the 'great' tier at and below the 12 ms boundary", () => {
    expect(adviseLatency(0).tier).toBe("great");
    expect(adviseLatency(6).tier).toBe("great");
    expect(adviseLatency(GREAT_MAX_MS).tier).toBe("great");
  });

  it("mentions real-time / immediate feel for the 'great' tier", () => {
    const { message } = adviseLatency(5);
    expect(message).toMatch(/real-time|immediate/i);
  });

  it("returns the 'usable' tier just above 12 ms and up to 30 ms", () => {
    expect(adviseLatency(GREAT_MAX_MS + 0.1).tier).toBe("usable");
    expect(adviseLatency(20).tier).toBe("usable");
    expect(adviseLatency(USABLE_MAX_MS).tier).toBe("usable");
  });

  it("mentions a slight delay for the 'usable' tier", () => {
    const { message } = adviseLatency(20);
    expect(message).toMatch(/delay/i);
  });

  it("returns the 'echo' tier above 30 ms", () => {
    expect(adviseLatency(USABLE_MAX_MS + 0.1).tier).toBe("echo");
    expect(adviseLatency(52).tier).toBe("echo");
    expect(adviseLatency(200).tier).toBe("echo");
  });

  it("recommends a USB audio interface for the 'echo' tier by default", () => {
    const { message } = adviseLatency(52);
    expect(message).toMatch(/echo/i);
    expect(message).toMatch(/usb audio interface/i);
    expect(message).toMatch(/hi-z/i);
  });

  it("attributes the echo tier to the mic path when kind is 'mic'", () => {
    const { message } = adviseLatency(52, "mic");
    expect(message).toMatch(/mic/i);
    expect(message).toMatch(/usb audio interface/i);
  });

  it("does not recommend buying an interface when one is already in use", () => {
    const { message } = adviseLatency(52, "interface");
    expect(message).not.toMatch(/usb audio interface/i);
    expect(message).toMatch(/echo/i);
  });

  it("treats 'unknown' kind the same as the default (no kind passed)", () => {
    expect(adviseLatency(52, "unknown")).toEqual(adviseLatency(52));
  });

  it("is a pure function — same input always yields an equal result", () => {
    expect(adviseLatency(15)).toEqual(adviseLatency(15));
  });

  it("handles fractional and negative-edge ms values without throwing", () => {
    expect(() => adviseLatency(-1)).not.toThrow();
    expect(adviseLatency(-1).tier).toBe("great");
    expect(adviseLatency(11.999).tier).toBe("great");
    expect(adviseLatency(12.001).tier).toBe("usable");
  });
});
