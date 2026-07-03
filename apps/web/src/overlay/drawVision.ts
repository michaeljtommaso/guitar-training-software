// Vision overlay layer (WP-3 deliverable 6): fret grid projected from the
// INVERSE homography, fingertip halos, and per-string R/Y/G bars. Drawn on the
// main thread over the <video>, so it uses the resolved CSS status palette.
// Global opacity follows the DECAYED calibration confidence, so the overlay
// visibly dims when the marker/calibration is lost (§7 graceful degradation).
import type { StatusPalette } from "./statusPalette";
import { confColor } from "./statusPalette";
import type { VisionHot } from "../perception/perceptionStore";
import { applyHomography, invertHomography } from "../perception/vision/homography";
import { MAX_FRET, fretLineX, stringY } from "../perception/vision/fretboard";
import { FINGERTIP_LANDMARKS } from "../perception/vision/fingerMapping";
import { perStringStatus } from "../perception/vision/demoTarget";
import { decayConfidence, overlayOpacity } from "../perception/vision/degradation";
import { fusionHot } from "../fusion/fusionStore";

export function drawVision(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vh: VisionHot,
  palette: StatusPalette,
  now: number,
): void {
  const hasCalib = vh.H !== null;
  const decayed = hasCalib ? decayConfidence(vh.calibConf, now - vh.calibSeenAt) : 0;
  ctx.save();
  ctx.globalAlpha = hasCalib ? overlayOpacity(decayed) : 1;

  if (vh.H) {
    try {
      drawFretGrid(ctx, w, h, vh.H, palette);
    } catch {
      // singular homography — skip the grid this frame
    }
  }
  drawHalos(ctx, w, h, vh, palette);
  drawStringBars(ctx, w, vh, palette);
  drawHintLine(ctx, w, h, palette);

  ctx.restore();
}

/** WP-4: the current one-line fusion hint, drawn along the bottom edge. */
function drawHintLine(ctx: CanvasRenderingContext2D, w: number, h: number, palette: StatusPalette): void {
  if (!fusionHot.active || !fusionHot.hintText) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = "20px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const metrics = ctx.measureText(fusionHot.hintText);
  ctx.fillRect(8, h - 40, Math.min(w - 16, metrics.width + 16), 32);
  ctx.fillStyle = palette.warn;
  ctx.fillText(fusionHot.hintText, 16, h - 14, w - 32);
  ctx.restore();
}

function drawFretGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  H: number[],
  palette: StatusPalette,
): void {
  const Hinv = invertHomography(H); // fretboard-normalized → image-normalized
  const toXY = (bx: number, by: number) => {
    const p = applyHomography(Hinv, { x: bx, y: by });
    return { X: p.x * w, Y: p.y * h };
  };
  ctx.strokeStyle = palette.uncertain;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  for (let n = 0; n <= MAX_FRET; n++) {
    const a = toXY(fretLineX(n), 0);
    const b = toXY(fretLineX(n), 1);
    ctx.moveTo(a.X, a.Y);
    ctx.lineTo(b.X, b.Y);
  }
  for (let s = 1; s <= 6; s++) {
    const a = toXY(0, stringY(s));
    const b = toXY(1, stringY(s));
    ctx.moveTo(a.X, a.Y);
    ctx.lineTo(b.X, b.Y);
  }
  ctx.stroke();
  ctx.globalAlpha /= 0.85;
}

function drawHalos(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vh: VisionHot,
  palette: StatusPalette,
): void {
  const assignByFinger = new Map(vh.assigns.map((a) => [a.finger, a]));
  for (const hand of vh.hands) {
    for (const { finger, index } of FINGERTIP_LANDMARKS) {
      const lm = hand.landmarks[index];
      if (!lm) continue;
      const X = lm[0] * w;
      const Y = lm[1] * h;
      const assign = assignByFinger.get(finger);
      ctx.beginPath();
      ctx.arc(X, Y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = assign ? confColor(assign.conf, palette) : palette.uncertain;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

function drawStringBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  vh: VisionHot,
  palette: StatusPalette,
): void {
  // WP-4: when a lesson is running, the FUSED audio+vision status owns the
  // bars; the vision-only demo target remains the no-lesson fallback.
  const status =
    fusionHot.active && fusionHot.stringStatus ? fusionHot.stringStatus : perStringStatus(vh.assigns);
  const barW = 14;
  const gap = 6;
  const x0 = w - (barW + gap) * 6 - 12;
  const y = 12;
  const barH = 40;
  for (let s = 6; s >= 1; s--) {
    const i = 6 - s;
    ctx.fillStyle = palette[status[s]];
    ctx.fillRect(x0 + i * (barW + gap), y, barW, barH);
  }
}
