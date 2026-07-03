import { describe, expect, it } from "vitest";
import { classifyStrum, STRUM_SPEED_THRESHOLD, type WristSample } from "./strum";

// Synthetic wrist trajectories. Image y grows downward, so a DOWN strum has
// increasing y.
function trajectory(y0: number, y1: number, steps = 6, spanMs = 200): WristSample[] {
  const out: WristSample[] = [];
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);
    out.push({ t: 1000 + f * spanMs, y: y0 + (y1 - y0) * f });
  }
  return out;
}

describe("classifyStrum", () => {
  it("detects a down-strum (wrist accelerating toward the floor)", () => {
    const r = classifyStrum(trajectory(0.3, 0.7)); // +0.4 over 0.2 s = 2.0 u/s
    expect(r.dir).toBe("down");
    expect(r.conf).toBeGreaterThan(0.5);
  });

  it("detects an up-strum", () => {
    const r = classifyStrum(trajectory(0.7, 0.3));
    expect(r.dir).toBe("up");
    expect(r.conf).toBeGreaterThan(0.5);
  });

  it("reports 'none' for a near-stationary wrist", () => {
    const r = classifyStrum(trajectory(0.5, 0.505)); // 0.005 / 0.2 s = 0.025 u/s
    expect(r.dir).toBe("none");
    expect(r.conf).toBeLessThan(0.5);
  });

  it("needs at least two samples", () => {
    expect(classifyStrum([{ t: 0, y: 0.5 }])).toEqual({ dir: "none", conf: 0 });
    expect(classifyStrum([])).toEqual({ dir: "none", conf: 0 });
  });

  it("a jittery-but-net-down move is lower confidence than a clean one", () => {
    const clean = classifyStrum(trajectory(0.3, 0.75));
    const jittery = classifyStrum([
      { t: 1000, y: 0.3 },
      { t: 1040, y: 0.42 },
      { t: 1080, y: 0.38 }, // backtrack
      { t: 1120, y: 0.55 },
      { t: 1160, y: 0.5 }, // backtrack
      { t: 1200, y: 0.75 },
    ]);
    expect(clean.dir).toBe("down");
    expect(jittery.dir).toBe("down");
    expect(jittery.conf).toBeLessThan(clean.conf);
  });

  it("threshold constant is sane", () => {
    expect(STRUM_SPEED_THRESHOLD).toBeGreaterThan(0);
  });
});
