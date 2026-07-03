// STFT heatmap strip (computeSpectrogram, built on the copied fft.ts) with a
// playhead synced to the video's current time.
import { useEffect, useMemo, useRef } from "react";
import { computeSpectrogram } from "../audio/spectrogram";
import { STATUS_COLORS } from "../theme/statusColors";

export interface SpectrogramCanvasProps {
  channel: Float32Array | null;
  sampleRate: number;
  duration: number;
  currentTime: number;
}

function magToColor(v: number): string {
  // Simple single-hue heatmap: log-scaled magnitude -> lightness.
  const l = Math.min(1, Math.log1p(v) / 6);
  const lightness = Math.round(l * 70);
  return `hsl(200 90% ${lightness}%)`;
}

export function SpectrogramCanvas({ channel, sampleRate, duration, currentTime }: SpectrogramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const result = useMemo(() => {
    if (!channel || channel.length === 0) return null;
    return computeSpectrogram(channel, sampleRate, 1024, 512);
  }, [channel, sampleRate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    if (result && result.frames.length > 0) {
      const colWidth = width / result.frames.length;
      const bins = result.frames[0].length;
      const rowHeight = height / bins;
      for (let x = 0; x < result.frames.length; x++) {
        const frame = result.frames[x];
        for (let k = 0; k < bins; k++) {
          ctx.fillStyle = magToColor(frame[k]);
          // Low freq at the bottom.
          ctx.fillRect(x * colWidth, height - (k + 1) * rowHeight, colWidth + 1, rowHeight + 1);
        }
      }
    }
    if (duration > 0) {
      const px = (currentTime / duration) * width;
      ctx.strokeStyle = STATUS_COLORS.warn;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
  }, [result, duration, currentTime]);

  return <canvas ref={canvasRef} width={800} height={160} className="strip-canvas" role="img" aria-label="Spectrogram" />;
}
