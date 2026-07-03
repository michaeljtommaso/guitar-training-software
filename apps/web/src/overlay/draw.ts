// Overlay draw module (Canvas 2D, ADR-003): static test grid + live FPS +
// audio stats readout. Canvas cannot read CSS custom properties, so colors
// come from the mirrored STATUS_COLORS constants.
import { STATUS_COLORS } from "../theme/statusColors";
import type { PerceptionSnapshot } from "../perception/perceptionStore";

const GRID_STEP = 80;
const MONO = '14px "IBM Plex Mono", monospace';

// Onset flash: lastOnsetT is on the audio clock, incomparable to the overlay's
// performance-clock; instead flash for a fixed window whenever it changes.
let prevOnsetT = NaN;
let flashUntil = 0;
const ONSET_FLASH_MS = 140;

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fps: number,
  snap: PerceptionSnapshot,
): void {
  ctx.clearRect(0, 0, width, height);

  // Static test grid
  ctx.strokeStyle = STATUS_COLORS.uncertain;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = GRID_STEP; x < width; x += GRID_STEP) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = GRID_STEP; y < height; y += GRID_STEP) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Live readout — IBM Plex Mono numerals
  ctx.font = MONO;
  ctx.fillStyle = STATUS_COLORS.correct;
  ctx.fillText(`${fps.toFixed(1)} fps`, 12, 24);

  ctx.fillStyle = STATUS_COLORS.uncertain;
  const a = snap.audio;
  ctx.fillText(
    a
      ? `audio frames ${a.framesRead}  dropped ${a.dropped}  latency ${a.latencyMs.toFixed(1)} ms`
      : "audio: waiting",
    12,
    44,
  );
  ctx.fillText(`backend ${snap.backend ?? "probing"}  driver ${snap.frameDriver ?? "-"}`, 12, 64);

  // --- WP-2 audio perception readout ---------------------------------------
  const an = snap.audioAnalysis;
  if (an?.chord) {
    const strong = an.chord.conf >= 0.6 && an.chord.label !== "silence" && an.chord.label !== "noise";
    ctx.fillStyle = strong ? STATUS_COLORS.correct : STATUS_COLORS.uncertain;
    ctx.fillText(`chord ${an.chord.label}  ${(an.chord.conf * 100).toFixed(0)}%`, 12, 88);
  }
  if (an?.tuning) {
    const off = Math.abs(an.tuning.cents);
    ctx.fillStyle =
      off <= 5 ? STATUS_COLORS.correct : off <= 15 ? STATUS_COLORS.warn : STATUS_COLORS.error;
    const sign = an.tuning.cents >= 0 ? "+" : "";
    ctx.fillText(
      `tuner ${an.tuning.name}  ${sign}${an.tuning.cents.toFixed(1)} cents`,
      12,
      108,
    );
  }

  // Onset flash marker (top-right).
  const now = performance.now();
  if (snap.lastOnsetT !== prevOnsetT && Number.isFinite(snap.lastOnsetT)) {
    prevOnsetT = snap.lastOnsetT;
    flashUntil = now + ONSET_FLASH_MS;
  }
  if (now < flashUntil) {
    ctx.fillStyle = STATUS_COLORS.warn;
    ctx.beginPath();
    ctx.arc(width - 24, 24, 10, 0, 2 * Math.PI);
    ctx.fill();
  }
}
