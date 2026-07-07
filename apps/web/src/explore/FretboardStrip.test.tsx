import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FretboardStrip } from "./FretboardStrip";
import type { ExploreTarget } from "./exploreStore";

const AM: ExploreTarget = {
  kind: "chord", root: "A", suffix: "minor", active: 0,
  voicings: [{ frets: [0, 1, 2, 2, 0, -1], fingers: [0, 1, 3, 2, 0, 0], barres: [], baseFret: 1, window: [0, 4], difficulty: 13 }],
};
const GMAJ: ExploreTarget = {
  kind: "scale", root: "G", scaleType: "major",
  positions: [
    { string: 6, fret: 3, midi: 43, note: "G2", degree: "1", isRoot: true },
    { string: 5, fret: 0, midi: 45, note: "A2", degree: "2", isRoot: false },
  ],
};

describe("FretboardStrip", () => {
  it("chord mode: one finger dot per fretted string, open circles, muted ×", () => {
    const { container } = render(<FretboardStrip target={AM} />);
    expect(container.querySelectorAll("[data-dot='finger']")).toHaveLength(3); // frets 1,2,2
    expect(container.querySelectorAll("[data-dot='open']")).toHaveLength(2);   // strings 1,5
    expect(container.querySelectorAll("[data-dot='muted']")).toHaveLength(1);  // string 6
    expect(container.textContent).toContain("1"); // finger numbers rendered
  });
  it("scale mode: root filled + degree labels", () => {
    const { container } = render(<FretboardStrip target={GMAJ} window={[0, 12]} />);
    const root = container.querySelector("[data-dot='root']");
    expect(root).not.toBeNull();
    expect(container.textContent).toContain("2");
  });
  it("full-tier heard state renders per-string ticks", () => {
    const { container } = render(
      <FretboardStrip target={AM} heard={{ chordHeard: true, strings: ["ok", "ok", "pending", "pending", "ok", "muted-expected"] }} />,
    );
    expect(container.querySelectorAll("[data-tick='ok']")).toHaveLength(3);
  });
  it("null target renders an empty board without crashing", () => {
    const { container } = render(<FretboardStrip target={null} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
