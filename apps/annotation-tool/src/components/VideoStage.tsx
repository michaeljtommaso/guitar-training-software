// Local video file playback with frame stepping (seek by 1/fps) and keyboard
// shortcuts (←/→ step a frame, space play/pause). No upload — the file never
// leaves the browser (object URL only).
import { useEffect, useRef } from "react";

export interface VideoStageProps {
  fps: number;
  onFile(file: File): void;
  onTimeUpdate(t: number, duration: number): void;
  onLoadedMeta(videoEl: HTMLVideoElement): void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function stepFrame(current: number, fps: number, dir: 1 | -1): number {
  return Math.max(0, current + dir * (1 / fps));
}

export function VideoStage({ fps, onFile, onTimeUpdate, onLoadedMeta, videoRef }: VideoStageProps) {
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        el.currentTime = stepFrame(el.currentTime, fps, 1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        el.currentTime = stepFrame(el.currentTime, fps, -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fps, videoRef]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    if (videoRef.current) videoRef.current.src = url;
    onFile(file);
  };

  return (
    <div className="video-stage">
      <input type="file" accept="video/*" onChange={handleFile} aria-label="Load video file" />
      <video
        ref={videoRef}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => onLoadedMeta(e.currentTarget)}
        controls
        className="video-stage-el"
      />
      <p className="video-stage-hint">Space: play/pause · ←/→: step one frame (fps={fps})</p>
    </div>
  );
}
