// Pure pairing/median logic for the round-trip latency probe. Plain number
// arrays — no audio. Locks: match window, first-onset-after, consume-once, and
// the <2-match null contract lives in measureRoundTrip (not tested here).
import { describe, expect, it } from "vitest";
import { MATCH_WINDOW_MS, medianMs, pairClicksToOnsets } from "./latencyProbe";

describe("pairClicksToOnsets", () => {
  it("pairs each click with the first onset after it (round-trip deltas)", () => {
    expect(pairClicksToOnsets([0, 1000, 2000], [30, 1035, 2040])).toEqual([30, 35, 40]);
  });

  it("drops clicks whose onset falls outside the match window", () => {
    // Second click's onset is 600 ms later (> 500) → dropped.
    expect(pairClicksToOnsets([0, 1000], [30, 1600])).toEqual([30]);
  });

  it("ignores onsets that occur before their click", () => {
    expect(pairClicksToOnsets([100], [50])).toEqual([]);
    expect(pairClicksToOnsets([100], [100])).toEqual([]); // strictly-after
  });

  it("consumes each onset once (no double-count across overlapping windows)", () => {
    // One onset at 400 sits within 500 ms of both clicks — only the first claims it.
    expect(pairClicksToOnsets([0, 100], [400])).toEqual([400]);
  });

  it("matches at exactly the window edge", () => {
    expect(pairClicksToOnsets([0], [MATCH_WINDOW_MS])).toEqual([MATCH_WINDOW_MS]);
  });

  it("returns empty when there are no onsets", () => {
    expect(pairClicksToOnsets([0, 700], [])).toEqual([]);
  });
});

describe("medianMs", () => {
  it("is null for an empty array", () => {
    expect(medianMs([])).toBeNull();
  });
  it("returns the middle of an odd-length set", () => {
    expect(medianMs([40, 30, 35])).toBe(35);
  });
  it("averages the two middle values of an even-length set", () => {
    expect(medianMs([30, 40])).toBe(35);
  });
});
