// Min/max waveform strip with a playhead synced to the video's current time.
// Audio comes from decodeVideoAudio.ts (AudioContext.decodeAudioData).
import { useEffect, useRef } from "react";
import { computeMinMaxBuckets } from "../audio/waveformBuckets";
import { STATUS_COLORS } from "../theme/statusColors";

export interface WaveformCanvasProps {
  channel: Float32Array | null;
  duration: number;
  currentTime: number;
  onSeek(t: number): void;
}

export function WaveformCanvas({ channel, duration, currentTime, onSeek }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);
    if (channel && channel.length > 0) {
      const buckets = computeMinMaxBuckets(channel, width);
      const mid = height / 2;
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      for (let x = 0; x < buckets.length; x++) {
        const { min, max } = buckets[x];
        ctx.moveTo(x, mid + min * mid);
        ctx.lineTo(x, mid + max * mid);
      }
      ctx.stroke();
    }
    if (duration > 0) {
      const px = (currentTime / duration) * width;
      ctx.strokeStyle = STATUS_COLORS.warn;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
  }, [channel, duration, currentTime]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, frac * duration)));
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={100}
      className="strip-canvas"
      onClick={handleClick}
      role="img"
      aria-label="Waveform"
    />
  );
}
