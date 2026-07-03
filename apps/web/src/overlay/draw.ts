// Overlay draw module (Canvas 2D, ADR-003): static test grid + live FPS +
// audio stats readout. Canvas cannot read CSS custom properties, so colors
// come from the mirrored STATUS_COLORS constants.
import { STATUS_COLORS } from "../theme/statusColors";
import type { PerceptionSnapshot } from "../perception/perceptionStore";

const GRID_STEP = 80;
const MONO = '14px "IBM Plex Mono", monospace';

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
}
