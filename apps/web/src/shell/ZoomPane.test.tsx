import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ZoomPane } from "./ZoomPane";
import { STRIP_W, STRIP_H } from "../perception/vision/fretboard";
import { drawVision } from "../overlay/drawVision";
import { getLesson } from "../fusion/lessons";
import type { FusionTarget } from "../overlay/targetDots";
import type { VisionHot } from "../perception/perceptionStore";
import type { StatusPalette } from "../overlay/statusPalette";

const PAL: StatusPalette = { correct: "#0f0", warn: "#ff0", error: "#f00", uncertain: "#888" };
const UNCALIBRATED: VisionHot = {
  hands: [],
  assigns: [],
  H: null,
  calibConf: 0,
  calibSeenAt: 0,
  calibLive: false,
  strum: { dir: "none", conf: 0 },
};

// A permissive 2D-context stub — jsdom has no canvas backend, so we hand the
// pane (and drawVision) a no-op context to exercise the registration path.
function ctxStub(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, prop) => (prop === "measureText" ? () => ({ width: 10 }) : () => {}),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe("ZoomPane — structure & fallback (never blanks, §6)", () => {
  it("renders the pane, the live canvas, and the schematic fallback strip", () => {
    render(<ZoomPane />);
    expect(screen.getByTestId("zoom-pane")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-pane-live")).toBeInTheDocument();
    expect(screen.getByTestId("fretboard-strip")).toBeInTheDocument();
  });

  it("renders a lesson target as a display voicing on the fallback strip", () => {
    const step = getLesson("open_chords_c_major")!.steps[0];
    const target: FusionTarget = {
      fingering: step.accepted_fingerings[0],
      expectedStrings: step.expected_strings,
      avoidStrings: step.avoid_strings,
    };
    const { container } = render(<ZoomPane lessonTarget={target} />);
    expect(container.querySelectorAll('[data-dot="finger"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-dot="muted"]')).toBeTruthy(); // low E muted
  });

  it("exposes a preview variant at a smaller canvas size (§7 wizard reuse)", () => {
    render(<ZoomPane variant="preview" />);
    expect(screen.getByTestId("zoom-pane")).toHaveAttribute("data-variant", "preview");
    const canvas = screen.getByTestId("zoom-pane-live") as HTMLCanvasElement;
    expect(canvas.width).toBe(480);
    // Buffer aspect matches the FretboardStrip viewBox (STRIP_W:STRIP_H) so the
    // live crop isn't stretched — preview h = round(480 * STRIP_H / STRIP_W).
    expect(canvas.height).toBe(Math.round((480 * STRIP_H) / STRIP_W));
  });
});

describe("ZoomPane — frame hook (no second rVFC loop, §6)", () => {
  it("is driven by the existing overlay frame callback and hides the live canvas when uncalibrated", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxStub() as never);
    render(<ZoomPane />);
    const canvas = screen.getByTestId("zoom-pane-live") as HTMLCanvasElement;
    canvas.style.opacity = "0.9"; // prove the registered renderer resets it

    // Invoke the REAL overlay draw cycle — the pane registered itself into it.
    drawVision(ctxStub(), 1280, 720, UNCALIBRATED, PAL, 0);
    expect(canvas.style.opacity).toBe("0"); // uncalibrated → fallback shows through
    vi.restoreAllMocks();
  });

  it("clears its registration on unmount (the frame callback stops touching it)", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctxStub() as never);
    const { unmount } = render(<ZoomPane />);
    const canvas = screen.getByTestId("zoom-pane-live") as HTMLCanvasElement;
    unmount();
    canvas.style.opacity = "0.5";
    drawVision(ctxStub(), 1280, 720, UNCALIBRATED, PAL, 0);
    expect(canvas.style.opacity).toBe("0.5"); // untouched after unmount
    vi.restoreAllMocks();
  });
});
