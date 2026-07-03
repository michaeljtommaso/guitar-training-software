// Frame-aligned callback loop: requestVideoFrameCallback when available
// (aligned to actual decoded video frames, ADR-003), requestAnimationFrame
// as the fallback.
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export interface FrameLoop {
  driver: "rvfc" | "raf";
  stop(): void;
}

export function startVideoFrameLoop(video: HTMLVideoElement, cb: () => void): FrameLoop {
  const v = video as RvfcVideo;
  const useRvfc = typeof v.requestVideoFrameCallback === "function";
  let handle = 0;
  let running = true;

  const schedule = () => {
    handle = useRvfc ? v.requestVideoFrameCallback!(tick) : requestAnimationFrame(tick);
  };
  const tick = () => {
    if (!running) return;
    cb();
    schedule();
  };
  schedule();

  return {
    driver: useRvfc ? "rvfc" : "raf",
    stop() {
      running = false;
      if (useRvfc) v.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
    },
  };
}
