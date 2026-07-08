// ZoomPane (spec §6) — the project's one new capability: a HYBRID fretboard zoom.
//
//   • Calibrated → a live, full-res CROP of the real fretboard (one drawImage per
//     frame) with the overlay's target dots RE-PROJECTED into the zoom (§6.4) and
//     per-string ✓/– ticks (§6.5).
//   • Uncalibrated / camera-off / capture-not-running → the schematic
//     `FretboardStrip` fallback. The pane NEVER blanks (§6 fallback path).
//   • Calibration lost → crossfade from live to fallback within ~500 ms, driven by
//     the SAME decayed confidence the main overlay uses (§6.6).
//
// NO second rVFC loop (§6): the live drawing runs inside the existing overlay
// frame callback via `setZoomRenderer` (overlay/drawVision.ts) — registered on
// mount, cleared on unmount. When no overlay frame loop is running (e.g. the
// wizard preview before calibration), the renderer simply never fires and the
// canvas stays hidden behind the schematic strip.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { FretboardStrip } from "../explore/FretboardStrip";
import { setZoomRenderer, type ZoomFrameInput } from "../overlay/drawVision";
import { fingerInitial, type TargetDot } from "../overlay/targetDots";
import type { FusionTarget } from "../overlay/targetDots";
import type { ExploreTarget } from "../explore/exploreStore";
import type { HeardState } from "../explore/feedback";
import { applyHomography, invertHomography, type Homography } from "../perception/vision/homography";
import { MAX_FRET, fretLineX, stringY, STRIP_W, STRIP_H } from "../perception/vision/fretboard";
import { OVERLAY_DIM_THRESHOLD } from "../perception/vision/degradation";
import { perStringStatus } from "../perception/vision/demoTarget";
import { visionHot } from "../perception/perceptionStore";
import { fusionHot } from "../fusion/fusionStore";
import type { StatusPalette } from "../overlay/statusPalette";
import { zoomCropRect, toZoomSpace, lessonTargetToVoicing } from "./zoomMath";

// Redraw stride (spec §6 perf budget). One drawImage + ≤~30 dot transforms per
// frame is well within the main-thread budget, so we render EVERY frame (stride
// 1). DECISION: keep stride 1 — no glass→worker/rVFC regression was observed
// against the pre-branch numbers. If a regression ever appears, bump this to 2
// (redraw every 2nd frame) as the spec's documented escape hatch; the fallback
// strip and the crossfade both remain correct at any stride.
const FRAME_STRIDE = 1;

type ZoomVariant = "practice" | "preview";

// Both variants share the FretboardStrip aspect (STRIP_W:STRIP_H) so the live
// crop is never stretched; tune the height in one place via STRIP_H.
const SIZES: Record<ZoomVariant, { w: number; h: number }> = {
  practice: { w: STRIP_W, h: STRIP_H },
  preview: { w: 480, h: Math.round((480 * STRIP_H) / STRIP_W) },
};

export interface ZoomPaneProps {
  /** The live capture video. Absent/null → pure fallback (schematic strip). */
  video?: HTMLVideoElement | null;
  /** `practice` (full) or `preview` (wizard). Same component, smaller box. */
  variant?: ZoomVariant;
  /** Explore-mode target rendered as-is on the fallback strip (§6 fallback). */
  fallbackTarget?: ExploreTarget;
  /** Lesson target — converted to a display voicing for the fallback strip. */
  lessonTarget?: FusionTarget | null;
  heard?: HeardState;
  /** Optional content rendered at the right of the header row (spec: the small
   *  inline hint that used to live in the big box below the fretboard). */
  headerAside?: ReactNode;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function ZoomPane({ video, variant = "practice", fallbackTarget, lessonTarget, heard, headerAside }: ZoomPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest video in a ref so the registered renderer always sees the
  // current element without re-registering on every render.
  const videoRef = useRef<HTMLVideoElement | null>(video ?? null);
  videoRef.current = video ?? null;

  const size = SIZES[variant];

  // Fallback content: explore target as-is, else the lesson target converted to
  // a display voicing (§6). null → the strip renders the empty schematic board.
  const stripTarget: ExploreTarget = useMemo(
    () => fallbackTarget ?? lessonTargetToVoicing(lessonTarget ?? null),
    [fallbackTarget, lessonTarget],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    // jsdom throws (rather than returns null) from getContext with no canvas
    // backend, so guard it — no 2D context → fallback strip only.
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return;
    canvas.style.opacity = "0";
    let frame = 0;
    const render = (input: ZoomFrameInput) => {
      if (FRAME_STRIDE > 1 && frame++ % FRAME_STRIDE !== 0) return;
      try {
        drawZoom(ctx, canvas, videoRef.current, input, size);
      } catch {
        // Never let a mid-frame geometry error escape into the hot loop.
        canvas.style.opacity = "0";
      }
    };
    setZoomRenderer(render);
    return () => setZoomRenderer(null);
    // `size` is a stable module-constant object per variant (SIZES[variant]).
  }, [size]);

  return (
    <section
      className={`zoom-pane${variant === "preview" ? " zoom-pane--preview" : ""}`}
      data-testid="zoom-pane"
      data-variant={variant}
    >
      <header className="zoom-pane__header">
        <span className="zoom-pane__title">Fretboard zoom — live overlay</span>
        {headerAside}
      </header>
      <div className="zoom-pane__stage" style={{ aspectRatio: `${STRIP_W} / ${STRIP_H}` }}>
        <FretboardStrip target={stripTarget} heard={heard} />
        <canvas
          ref={canvasRef}
          className="zoom-pane__live"
          data-testid="zoom-pane-live"
          width={size.w}
          height={size.h}
        />
      </div>
    </section>
  );
}

/** One frame of the live crop path — the whole calibrated §6 pipeline. */
function drawZoom(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  input: ZoomFrameInput,
  size: { w: number; h: number },
): void {
  const { H, dots, palette, decayedConf, w: overlayW, h: overlayH } = input;
  // Crossfade (§6.6): live layer opacity rises with confidence and reaches 0 as
  // the held calibration decays below the dim threshold, revealing the strip.
  const liveOpacity = clamp01(decayedConf / OVERLAY_DIM_THRESHOLD);
  const vw = video?.videoWidth ?? 0;
  const vh = video?.videoHeight ?? 0;
  if (!video || vw === 0 || vh === 0 || !H || liveOpacity <= 0) {
    canvas.style.opacity = "0";
    return;
  }
  const crop = zoomCropRect(H, vw, vh);
  if (crop.sw <= 0 || crop.sh <= 0) {
    canvas.style.opacity = "0";
    return;
  }

  ctx.clearRect(0, 0, size.w, size.h);
  // Full-res source → sharper than CSS scaling (§6.3, research doc §zoom).
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.w, size.h);

  // Re-project the ALREADY-computed overlay dots (overlay-canvas px → video px →
  // zoom px). No geometry recompute (§6.4).
  for (const dot of dots) {
    const vp = { X: (dot.X / overlayW) * vw, Y: (dot.Y / overlayH) * vh };
    drawZoomDot(ctx, dot, toZoomSpace(vp, crop, size), palette);
  }

  drawStringTicks(ctx, H, vw, vh, crop, size, palette);
  canvas.style.opacity = String(liveOpacity);
}

/** A re-projected target dot, scaled down for the zoom (matches drawVision's
 *  filled/hollow/label idiom): avoid = ✕, open = ring, explore = filled disc +
 *  label, lesson finger = hollow ring + finger initial, tinted by fused status. */
function drawZoomDot(ctx: CanvasRenderingContext2D, dot: TargetDot, z: { X: number; Y: number }, palette: StatusPalette): void {
  const status = fusionHot.stringStatus?.[dot.string];
  const color = dot.label ? palette.uncertain : palette[status ?? "uncertain"];
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "10px 'IBM Plex Mono', monospace";
  if (dot.kind === "avoid") {
    const r = 5;
    ctx.beginPath();
    ctx.moveTo(z.X - r, z.Y - r);
    ctx.lineTo(z.X + r, z.Y + r);
    ctx.moveTo(z.X + r, z.Y - r);
    ctx.lineTo(z.X - r, z.Y + r);
    ctx.stroke();
  } else if (dot.kind === "open") {
    ctx.beginPath();
    ctx.arc(z.X, z.Y, 5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (dot.label) {
    ctx.beginPath();
    ctx.arc(z.X, z.Y, 9, 0, Math.PI * 2);
    ctx.fill();
    // Same idiom as drawVision.ts: label ink on a FILLED status-colored disc
    // drawn over live video — theme-independent canvas content, not UI chrome
    // (§11 smell-gate reviewed exception, mirrors drawVision's own literal).
    ctx.fillStyle = "#000"; // readable on the filled neutral disc
    ctx.fillText(dot.label, z.X, z.Y + 0.5);
  } else {
    ctx.beginPath();
    ctx.arc(z.X, z.Y, 9, 0, Math.PI * 2);
    ctx.stroke();
    if (dot.finger) ctx.fillText(fingerInitial(dot.finger), z.X, z.Y + 0.5);
  }
  ctx.restore();
}

/** Per-string ✓/– ticks on the right edge (§6.5), same data as the camera chips:
 *  the fused string status when a lesson runs, else the vision-only demo status. */
function drawStringTicks(
  ctx: CanvasRenderingContext2D,
  H: Homography,
  vw: number,
  vh: number,
  crop: { sx: number; sy: number; sw: number; sh: number },
  size: { w: number; h: number },
  palette: StatusPalette,
): void {
  const status =
    fusionHot.active && fusionHot.stringStatus ? fusionHot.stringStatus : perStringStatus(visionHot.assigns);
  let Hinv: Homography;
  try {
    Hinv = invertHomography(H);
  } catch {
    return;
  }
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  for (let s = 1; s <= 6; s++) {
    const p = applyHomography(Hinv, { x: fretLineX(MAX_FRET), y: stringY(s) });
    const z = toZoomSpace({ X: p.x * vw, Y: p.y * vh }, crop, size);
    const st = status[s] ?? "uncertain";
    const mark = st === "correct" ? "✓" : st === "uncertain" ? "–" : "·";
    ctx.fillStyle = palette[st];
    ctx.fillText(mark, size.w - 4, z.Y);
  }
  ctx.restore();
}
