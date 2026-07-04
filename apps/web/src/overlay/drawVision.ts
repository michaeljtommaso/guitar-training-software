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
import { planTargets, fingerInitial, type TargetDot } from "./targetDots";
import { FLASH_MS } from "./flash";
import type { StatusKey } from "../theme/statusColors";

// Debug hook (e2e) — what the overlay computed this frame. Attached to window at
// module load like the perception/fusion stores; never read by product code.
export const overlayDebug = {
  targetDotCount: 0,
  nudge: false,
  flashActive: false,
  flashColor: null as StatusKey | null,
};

// Flash is triggered on the diagnosis (event) clock but SHOWN on the display
// clock — so, exactly like the onset blip, we latch a fixed window whenever the
// hot-state flash trigger changes (its `t` is the event-time trigger key).
let prevFlashT = NaN;
let flashUntil = 0;
let flashKey: StatusKey = "error";

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

  // Lesson target finger dots (never faked — dots only when calibrated).
  const plan = planTargets(fusionHot.active, vh.H, fusionHot.target, w, h);
  overlayDebug.targetDotCount = plan.dots.length;
  overlayDebug.nudge = plan.nudge;
  const redFlash = now < flashUntil && flashKey === "error";
  try {
    if (plan.dots.length) drawTargetDots(ctx, plan.dots, palette, redFlash);
  } catch {
    // singular homography mid-frame — skip dots, keep the rest of the overlay
  }

  drawHalos(ctx, w, h, vh, palette);
  drawStringBars(ctx, w, vh, palette, redFlash);
  drawHintLine(ctx, w, h, palette);
  if (plan.nudge) drawCalibrateNudge(ctx, h, palette);

  ctx.restore();

  // Flash + nudge ride ABOVE the calibration dimming (own alpha).
  drawFlash(ctx, w, h, palette, now);
}

/** Confidence-gated wrong/right flash: a ~250ms edge glow, latched on the
 *  display clock. Red = confident wrong, green = confident ok (overlay/flash.ts). */
function drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number, palette: StatusPalette, now: number): void {
  const f = fusionHot.flash;
  if (f && f.t !== prevFlashT) {
    prevFlashT = f.t;
    flashUntil = now + FLASH_MS;
    flashKey = f.color;
  }
  overlayDebug.flashActive = now < flashUntil;
  overlayDebug.flashColor = now < flashUntil ? flashKey : null;
  if (now >= flashUntil) return;
  const remain = (flashUntil - now) / FLASH_MS; // 1 → 0 fade
  ctx.save();
  ctx.globalAlpha = 0.55 * remain;
  ctx.strokeStyle = palette[flashKey];
  ctx.shadowColor = palette[flashKey];
  ctx.shadowBlur = 48;
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, w - 18, h - 18); // inset edge glow — not a full-screen wash
  ctx.restore();
}

function drawCalibrateNudge(ctx: CanvasRenderingContext2D, h: number, palette: StatusPalette): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = "16px 'IBM Plex Mono', monospace";
  ctx.textBaseline = "bottom";
  const text = "calibrate to see finger targets";
  const metrics = ctx.measureText(text);
  const y = h - 52; // just above the hint line, clear of the top-left readout
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(8, y - 22, metrics.width + 16, 26);
  ctx.fillStyle = palette.uncertain;
  ctx.fillText(text, 16, y);
  ctx.restore();
}

/** Target finger dots: hollow rings (distinct from the FILLED detected halos)
 *  with the finger initial, tinted by the fused per-string status; open strings
 *  get a subtle nut ring, avoid strings a "don't play" ✕. */
function drawTargetDots(
  ctx: CanvasRenderingContext2D,
  dots: TargetDot[],
  palette: StatusPalette,
  redFlash: boolean,
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "12px 'IBM Plex Mono', monospace";
  for (const dot of dots) {
    const st: StatusKey = fusionHot.stringStatus?.[dot.string] ?? "uncertain";
    const color = palette[st];
    // Emphasize the offending string during a red flash.
    const hot = redFlash && st === "error";
    if (dot.kind === "avoid") {
      const r = 7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dot.X - r, dot.Y - r);
      ctx.lineTo(dot.X + r, dot.Y + r);
      ctx.moveTo(dot.X + r, dot.Y - r);
      ctx.lineTo(dot.X - r, dot.Y + r);
      ctx.stroke();
      continue;
    }
    if (dot.kind === "open") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(dot.X, dot.Y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    // Fingered dot: hollow ring + finger initial.
    ctx.strokeStyle = color;
    ctx.lineWidth = hot ? 5 : 3;
    ctx.beginPath();
    ctx.arc(dot.X, dot.Y, 14, 0, Math.PI * 2);
    ctx.stroke();
    if (dot.finger) {
      ctx.fillStyle = color;
      ctx.fillText(fingerInitial(dot.finger), dot.X, dot.Y + 1);
    }
  }
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
  redFlash: boolean,
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
    const x = x0 + i * (barW + gap);
    ctx.fillStyle = palette[status[s]];
    ctx.fillRect(x, y, barW, barH);
    // During a red flash, outline the offending (error) string's bar.
    if (redFlash && status[s] === "error") {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, barW + 2, barH + 2);
    }
  }
}

// e2e/debug hook — lets the overlay spec assert dots/flash without pixel-peeping.
declare global {
  interface Window {
    __overlayDebug?: typeof overlayDebug;
  }
}
if (typeof window !== "undefined") {
  window.__overlayDebug = overlayDebug;
}
