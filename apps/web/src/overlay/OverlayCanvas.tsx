// Canvas 2D overlay composited over the <video>, driven by rVFC (rAF
// fallback). Reads perception state from the module-level store inside the
// frame callback — never from React state (ADR-002/003).
import { useEffect, useRef } from "react";
import { hot, getSnapshot, setPerception } from "../perception/perceptionStore";
import { startVideoFrameLoop } from "../capture/videoFrameLoop";
import { drawOverlay } from "./draw";

export function OverlayCanvas({ video }: { video: HTMLVideoElement }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frames = 0;
    let windowStart = performance.now();
    const loop = startVideoFrameLoop(video, () => {
      hot.rvfcTicks++;
      frames++;
      const now = performance.now();
      if (now - windowStart >= 500) {
        hot.fps = (frames * 1000) / (now - windowStart);
        frames = 0;
        windowStart = now;
      }
      drawOverlay(ctx, canvas.width, canvas.height, hot.fps, getSnapshot());
    });
    setPerception({ frameDriver: loop.driver });
    return loop.stop;
  }, [video]);

  return <canvas ref={canvasRef} className="overlay-canvas" width={1280} height={720} />;
}
