// Setup wizard panel: camera/mic pickers, live preview with overlay, and the
// debug readout. Device labels populate after the first successful start
// (browser permission model); changing a picker while running restarts
// capture on the new device.
import { useRef, useState } from "react";
import { useCaptureStore } from "./captureStore";
import { listCaptureDevices } from "./devices";
import { startCapture, type CaptureHandles } from "./controller";
import { OverlayCanvas } from "../overlay/OverlayCanvas";
import { DebugPanel } from "./DebugPanel";
import { AudioDebugPanel } from "./AudioDebugPanel";

export function SetupWizard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlesRef = useRef<CaptureHandles | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const { cameras, mics, cameraId, micId, phase, error, setDevices, select, setPhase } =
    useCaptureStore();

  const start = async (videoDeviceId: string, audioDeviceId: string) => {
    const video = videoRef.current;
    if (!video) return;
    handlesRef.current?.stop();
    handlesRef.current = null;
    setVideoEl(null);
    setPhase("starting");
    try {
      handlesRef.current = await startCapture(video, {
        videoDeviceId: videoDeviceId || undefined,
        audioDeviceId: audioDeviceId || undefined,
      });
      setDevices(await listCaptureDevices()); // labels appear after permission
      setVideoEl(video);
      setPhase("running");
    } catch (err) {
      setPhase("error", err instanceof Error ? err.message : String(err));
    }
  };

  const stop = () => {
    handlesRef.current?.stop();
    handlesRef.current = null;
    setVideoEl(null);
    setPhase("idle");
  };

  const running = phase === "running";

  return (
    <section className="setup-wizard">
      <h2>Capture setup</h2>
      <p className="wizard-tip">
        Tip: a clip-on or secondary camera aimed straight at the fretboard gives the clearest view
        of your fretting hand.
      </p>
      <div className="wizard-controls">
        <label>
          Camera{" "}
          <select
            value={cameraId}
            onChange={(e) => {
              select({ cameraId: e.target.value });
              if (running) void start(e.target.value, micId);
            }}
          >
            <option value="">Default camera</option>
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Microphone{" "}
          <select
            value={micId}
            onChange={(e) => {
              select({ micId: e.target.value });
              if (running) void start(cameraId, e.target.value);
            }}
          >
            <option value="">Default microphone</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Microphone ${m.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={phase === "starting"}
            onClick={() => void start(cameraId, micId)}
          >
            {phase === "starting" ? "Starting" : "Start capture"}
          </button>
        )}
      </div>
      {phase === "error" && <p className="wizard-error">Could not start capture: {error}</p>}
      <div className="video-stage">
        <video ref={videoRef} muted playsInline autoPlay />
        {videoEl && <OverlayCanvas video={videoEl} />}
      </div>
      <DebugPanel />
      <AudioDebugPanel />
    </section>
  );
}
