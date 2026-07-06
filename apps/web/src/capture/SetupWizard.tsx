// Setup wizard panel: camera/mic pickers, live preview with overlay, and the
// debug readout. Device labels populate after the first successful start
// (browser permission model); changing a picker while running restarts
// capture on the new device.
import { useRef, useState } from "react";
import { useCaptureStore } from "./captureStore";
import { listCaptureDevices, classifyAudioInput, pickPreferredAudioInput } from "./devices";
import { startCapture, MANUAL_TAP_ORDER, type CaptureHandles } from "./controller";
import type { Point } from "../perception/vision/homography";
import { OverlayCanvas } from "../overlay/OverlayCanvas";
import { DebugPanel } from "./DebugPanel";
import { AudioDebugPanel } from "./AudioDebugPanel";
import { InputMeter } from "./InputMeter";
import { OpenStringCheck } from "./OpenStringCheck";
import { TonePanel } from "../tone/TonePanel";
import { LessonPanel } from "../fusion/LessonPanel";

export function SetupWizard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlesRef = useRef<CaptureHandles | null>(null);
  const autoPicked = useRef(false);
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
      const lists = await listCaptureDevices(); // labels appear after permission
      setDevices(lists);
      // ADR-013: auto-prefer a direct-input interface on first run if the user
      // has never chosen a mic. Guarded to run at most once per session.
      if (!autoPicked.current && !audioDeviceId) {
        autoPicked.current = true;
        const preferred = pickPreferredAudioInput(lists.mics);
        if (preferred) {
          select({ micId: preferred.deviceId });
          void start(videoDeviceId, preferred.deviceId); // restart on the interface
          return;
        }
      }
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
    setCalibMode(false);
    setTaps([]);
    setPhase("idle");
  };

  const running = phase === "running";

  // ADR-013 classification chip: label heuristic is a hint, not truth. Fall
  // back to the default device's label once the picker lists populate.
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const kind = classifyAudioInput(micLabel);

  // --- fretboard calibration (WP-3) ----------------------------------------
  const [calibMode, setCalibMode] = useState(false);
  const [taps, setTaps] = useState<Point[]>([]);
  const [calibMsg, setCalibMsg] = useState("");

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!calibMode || !handlesRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tap: Point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const next = [...taps, tap];
    if (next.length >= 4) {
      handlesRef.current.setManualCalibration(next);
      setTaps([]);
      setCalibMode(false);
      setCalibMsg("Calibrated from 4 taps (manual).");
    } else {
      setTaps(next);
    }
  };

  const detectCharuco = async () => {
    if (!handlesRef.current) return;
    setCalibMsg("Detecting ChArUco board…");
    try {
      const n = await handlesRef.current.calibrateCharuco();
      setCalibMsg(n > 0 ? `Calibrated from ChArUco (${n} corners).` : "No ChArUco board detected in frame.");
    } catch (err) {
      setCalibMsg(`ChArUco error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearCalib = () => {
    handlesRef.current?.clearCalibration();
    setTaps([]);
    setCalibMode(false);
    setCalibMsg("Calibration cleared.");
  };

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
        <span className={`input-kind ${kind}`}>
          {kind === "interface" ? "direct input" : kind === "mic" ? "mic · fallback (lower accuracy)" : "unknown input"}
        </span>
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
      {kind === "mic" && (
        <p className="wizard-tip">
          Mic mode: expect reduced note/timing accuracy. A USB audio interface with a Hi-Z/instrument
          input is recommended for reliable feedback.
        </p>
      )}
      {phase === "error" && <p className="wizard-error">Could not start capture: {error}</p>}
      {running && (
        <div className="wizard-controls">
          <button
            type="button"
            onClick={() => {
              setTaps([]);
              setCalibMode((m) => !m);
              setCalibMsg(calibMode ? "" : "Tap the four fretboard corners in order.");
            }}
          >
            {calibMode ? "Cancel tap calibration" : "Calibrate (tap 4 corners)"}
          </button>
          <button type="button" onClick={() => void detectCharuco()}>
            Detect ChArUco board
          </button>
          <button type="button" onClick={clearCalib}>
            Clear calibration
          </button>
          {calibMode && (
            <span className="wizard-tip">
              Tap: {MANUAL_TAP_ORDER[taps.length]?.label} ({taps.length}/4)
            </span>
          )}
          {!calibMode && calibMsg && <span className="wizard-tip">{calibMsg}</span>}
        </div>
      )}
      <div
        className="video-stage"
        onClick={onStageClick}
        style={calibMode ? { cursor: "crosshair" } : undefined}
      >
        <video ref={videoRef} muted playsInline autoPlay />
        {videoEl && <OverlayCanvas video={videoEl} />}
      </div>
      {running && <InputMeter />}
      {running && <OpenStringCheck />}
      {running && handlesRef.current && <TonePanel tone={handlesRef.current.tone} />}
      <LessonPanel />
      <DebugPanel />
      <AudioDebugPanel />
    </section>
  );
}
