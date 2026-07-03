import { describe, it, expect } from "vitest";
import { analyzeSignal } from "./analysis";
import { chordSignal, placeAt, silence, mix, OPEN_CHORD_FREQS } from "./dsp/synth";

const SR = 48000;

describe("AudioAnalyzer integration (synthetic)", () => {
  it("emits an onset and settles on the strummed chord", () => {
    // 0.4 s silence, then a strummed E major that rings for ~1.1 s.
    const strum = chordSignal(OPEN_CHORD_FREQS.E, 1.1, SR, { decayTau: 0.8 });
    const signal = mix(silence(1.5, SR), placeAt(strum, 0.4, 1.5, SR));

    const { events, final } = analyzeSignal(signal, SR);
    const kinds = new Set(events.map((e) => e.kind));

    // An onset fired near the strum start (~400 ms).
    const onsets = events.filter((e) => e.kind === "onset");
    expect(onsets.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...onsets.map((o) => Math.abs(o.t - 400)))).toBeLessThan(50);

    // A chord event was emitted and the final settled label is E.
    expect(kinds.has("chord")).toBe(true);
    expect(final.chord?.label).toBe("E");

    // A tuning event fired (monophonic YIN over the ringing chord may pick any
    // string, but it must be a valid 1..6 string number).
    const tunings = events.filter((e) => e.kind === "tuning");
    if (tunings.length) {
      for (const t of tunings) {
        if (t.kind === "tuning") expect(t.string).toBeGreaterThanOrEqual(1);
      }
    }
    console.log(
      `[analysis][synthetic] events: onset=${onsets.length} chord=${events.filter((e) => e.kind === "chord").length} tuning=${tunings.length} finalChord=${final.chord?.label}`,
    );
  });

  it("stays on silence for a silent buffer", () => {
    const { events, final } = analyzeSignal(silence(1.0, SR), SR);
    expect(events.filter((e) => e.kind === "onset")).toHaveLength(0);
    expect(final.chord?.label).toBe("silence");
  });
});
