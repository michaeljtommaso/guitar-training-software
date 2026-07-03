import { describe, expect, it } from "vitest";
import type { Landmark } from "../../fusion/events/visionEvents";
import { IDENTITY_HOMOGRAPHY } from "./homography";
import { fretLineX, stringY } from "./fretboard";
import { mapFingertips, muteRisk, toAssigns, type FingerReading } from "./fingerMapping";

// Build a 21-point hand where the five fingertips (4,8,12,16,20) sit at given
// image-normalized coords; everything else at origin. With the IDENTITY
// homography, image coords ARE normalized-fretboard coords, so we can place a
// finger directly in a target (string,fret) cell.
function hand(tips: Partial<Record<number, [number, number]>>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => [0, 0, 0] as Landmark);
  for (const [i, xy] of Object.entries(tips)) lm[+i] = [xy![0], xy![1], 0];
  return lm;
}
// Center of fret cell n (behind fret line n), on string s.
function cell(s: number, fret: number): [number, number] {
  const x = (fretLineX(fret - 1) + fretLineX(fret)) / 2;
  return [x, stringY(s)];
}
const byFinger = (rs: FingerReading[]) => Object.fromEntries(rs.map((r) => [r.finger, r]));

describe("fingertip → string/fret [synthetic, identity homography]", () => {
  it("recovers an open C-major shape (index 2/1, middle 4/2, ring 5/3)", () => {
    // index → string 2 fret 1, middle → string 4 fret 2, ring → string 5 fret 3.
    const lm = hand({
      8: cell(2, 1),
      12: cell(4, 2),
      16: cell(5, 3),
    });
    const r = byFinger(mapFingertips(lm, IDENTITY_HOMOGRAPHY, { homographyConf: 1 }));
    expect([r.index.string, r.index.fret]).toEqual([2, 1]);
    expect([r.middle.string, r.middle.fret]).toEqual([4, 2]);
    expect([r.ring.string, r.ring.fret]).toEqual([5, 3]);
    // On-string, in-cell, confident homography ⇒ high confidence.
    expect(r.index.conf).toBeGreaterThan(0.9);
    expect(r.middle.conf).toBeGreaterThan(0.9);
    expect(r.ring.conf).toBeGreaterThan(0.9);
  });

  it("skips the thumb by default, includes it when asked", () => {
    const lm = hand({ 4: cell(6, 1), 8: cell(2, 1) });
    expect(byFinger(mapFingertips(lm, IDENTITY_HOMOGRAPHY, { homographyConf: 1 })).thumb).toBeUndefined();
    const withThumb = byFinger(
      mapFingertips(lm, IDENTITY_HOMOGRAPHY, { homographyConf: 1, includeThumb: true }),
    );
    expect(withThumb.thumb.string).toBe(6);
  });

  it("edge: a fingertip halfway between two strings gets low confidence", () => {
    const midY = (stringY(2) + stringY(3)) / 2; // exactly between strings 2 and 3
    const x = (fretLineX(0) + fretLineX(1)) / 2;
    const r = byFinger(mapFingertips(hand({ 8: [x, midY] }), IDENTITY_HOMOGRAPHY, { homographyConf: 1 }));
    expect(r.index.conf).toBeLessThan(0.1);
    expect(r.index.muteRisk).toBeGreaterThan(0.9);
  });

  it("edge: behind the nut ⇒ open string (fret 0), reduced confidence", () => {
    const r = byFinger(
      mapFingertips(hand({ 8: [-0.1, stringY(2)] }), IDENTITY_HOMOGRAPHY, { homographyConf: 1 }),
    );
    expect(r.index.fret).toBe(0);
    expect(r.index.onWindow).toBe(false);
    expect(r.index.conf).toBeLessThan(0.6);
  });

  it("edge: past fret 5 ⇒ flagged off-window (fret MAX_FRET+1)", () => {
    const r = byFinger(
      mapFingertips(hand({ 8: [1.3, stringY(1)] }), IDENTITY_HOMOGRAPHY, { homographyConf: 1 }),
    );
    expect(r.index.fret).toBe(6);
    expect(r.index.onWindow).toBe(false);
  });

  it("edge: low homography confidence scales every assignment down", () => {
    const lm = hand({ 8: cell(2, 1) });
    const r = byFinger(mapFingertips(lm, IDENTITY_HOMOGRAPHY, { homographyConf: 0.2 }));
    expect(r.index.conf).toBeLessThanOrEqual(0.2);
  });

  it("edge: low landmark presence scales the tip's confidence down", () => {
    const lm = hand({ 8: cell(2, 1) });
    const presence = Array(21).fill(1);
    presence[8] = 0.3;
    const r = byFinger(mapFingertips(lm, IDENTITY_HOMOGRAPHY, { homographyConf: 1, presence }));
    expect(r.index.conf).toBeLessThanOrEqual(0.3);
  });

  it("toAssigns strips readings to the exact §9.1 FingerAssign shape", () => {
    const readings = mapFingertips(hand({ 8: cell(2, 1) }), IDENTITY_HOMOGRAPHY, { homographyConf: 1 });
    expect(toAssigns(readings)[0]).toEqual({
      finger: "index",
      string: 2,
      fret: 1,
      conf: expect.any(Number),
    });
  });
});

describe("muteRisk", () => {
  it("is ~1 on a string line's midpoint to a neighbour, ~0 when centered", () => {
    expect(muteRisk(0, 0.2)).toBeCloseTo(0, 6); // right on the string
    expect(muteRisk(0.1, 0.1)).toBeCloseTo(1, 6); // halfway to the neighbour
  });
});
