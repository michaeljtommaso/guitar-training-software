// Capture host (v2-ui T6) — the ONE owner of the live capture session.
//
// Why this exists: capture is bound to a single <video> element for its whole
// lifetime (controller.ts closes over it for the frame pump, ChArUco grabs and
// stop()), so the wizard and the practice screen must share ONE element and ONE
// CaptureHandles for capture to survive the Wizard → PracticeScreen transition
// without a stop/restart (spec §7 invariant). AppShell calls this hook once and
// hands the host to both surfaces; the <video> element is created imperatively
// here (never re-created by React) and physically moved between screens by
// `VideoMount`.
//
// The start/stop/calibration logic below is LIFTED from the old SetupWizard.tsx
// (deleted in this task) — behavior identical, ownership moved. controller.ts
// and captureStore stay untouched (read-only for the whole v2-ui project).
import { useRef, useState } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { listCaptureDevices, pickPreferredAudioInput } from "../capture/devices";
import { startCapture, type CaptureHandles } from "../capture/controller";
import type { Point } from "../perception/vision/homography";

export interface CaptureHost {
  /** The singleton capture <video> element. Always exists; mount it into the
   *  current screen with `VideoMount`. */
  video: HTMLVideoElement;
  /** Live capture handles, or null when capture isn't running. */
  handles: CaptureHandles | null;
  /** The video element once capture is RUNNING, else null — the same gate the
   *  old SetupWizard used for mounting OverlayCanvas / feeding ZoomPane. */
  videoEl: HTMLVideoElement | null;
  /** Start (or restart, e.g. on a device change) capture on the host video.
   *  Empty-string ids mean system defaults, exactly as before. */
  start(videoDeviceId: string, audioDeviceId: string): Promise<void>;
  /** Stop capture and reset phase/calibration UI state to idle. */
  stop(): void;
  // ── manual 4-tap calibration UI state (lifted from SetupWizard) ───────────
  calibMode: boolean;
  taps: Point[];
  calibMsg: string;
  toggleCalibMode(): void;
  /** One normalized (0..1) tap on the video stage; the 4th tap solves and
   *  applies the homography. No-op outside calibMode / without handles. */
  tapCalibration(tap: Point): void;
  detectCharuco(): Promise<void>;
  clearCalibration(): void;
}

function createCaptureVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.autoplay = true;
  // React would set this via the playsInline prop; do both for parity.
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  return v;
}

export function useCaptureHost(): CaptureHost {
  // The element is created ONCE per host and never torn down by React.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  if (videoRef.current === null) videoRef.current = createCaptureVideo();
  const video = videoRef.current;

  const handlesRef = useRef<CaptureHandles | null>(null);
  const autoPicked = useRef(false);
  const [handles, setHandles] = useState<CaptureHandles | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const [calibMode, setCalibMode] = useState(false);
  const [taps, setTaps] = useState<Point[]>([]);
  const [calibMsg, setCalibMsg] = useState("");

  const resetCalibUi = () => {
    setCalibMode(false);
    setTaps([]);
    setCalibMsg("");
  };

  // ── capture start (lifted as-is from SetupWizard.tsx) ─────────────────────
  const start = async (videoDeviceId: string, audioDeviceId: string): Promise<void> => {
    const store = useCaptureStore.getState();
    handlesRef.current?.stop();
    handlesRef.current = null;
    setHandles(null);
    setVideoEl(null);
    store.setPhase("starting");
    try {
      const next = await startCapture(video, {
        videoDeviceId: videoDeviceId || undefined,
        audioDeviceId: audioDeviceId || undefined,
      });
      handlesRef.current = next;
      const lists = await listCaptureDevices(); // labels appear after permission
      useCaptureStore.getState().setDevices(lists);
      // ADR-013: auto-prefer a direct-input interface on first run if the user
      // has never chosen a mic. Guarded to run at most once per session.
      if (!autoPicked.current && !audioDeviceId) {
        autoPicked.current = true;
        const preferred = pickPreferredAudioInput(lists.mics);
        if (preferred) {
          useCaptureStore.getState().select({ micId: preferred.deviceId });
          await start(videoDeviceId, preferred.deviceId); // restart on the interface
          return;
        }
      }
      setHandles(next);
      setVideoEl(video);
      useCaptureStore.getState().setPhase("running");
    } catch (err) {
      // A persisted cameraId/micId (gt-capture-devices) can go stale if the
      // device was unplugged since last session; getUserMedia's exact-match
      // deviceId constraint then throws OverconstrainedError. Clear the
      // stale ids and retry once on system defaults. The retry call passes
      // empty ids, so this guard is false on the second failure and it
      // falls through to the normal error path (no infinite loop).
      if (err instanceof Error && err.name === "OverconstrainedError" && (videoDeviceId || audioDeviceId)) {
        useCaptureStore.getState().select({ cameraId: "", micId: "" });
        await start("", ""); // retry once on system defaults
        return;
      }
      useCaptureStore.getState().setPhase("error", err instanceof Error ? err.message : String(err));
    }
  };

  const stop = () => {
    handlesRef.current?.stop();
    handlesRef.current = null;
    setHandles(null);
    setVideoEl(null);
    resetCalibUi();
    useCaptureStore.getState().setPhase("idle");
  };

  // ── fretboard calibration (lifted as-is from SetupWizard.tsx) ─────────────
  const toggleCalibMode = () => {
    setTaps([]);
    setCalibMode((m) => !m);
    setCalibMsg(calibMode ? "" : "Tap the four fretboard corners in order.");
  };

  const tapCalibration = (tap: Point) => {
    if (!calibMode || !handlesRef.current) return;
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

  const clearCalibration = () => {
    handlesRef.current?.clearCalibration();
    setTaps([]);
    setCalibMode(false);
    setCalibMsg("Calibration cleared.");
  };

  return {
    video,
    handles,
    videoEl,
    start,
    stop,
    calibMode,
    taps,
    calibMsg,
    toggleCalibMode,
    tapCalibration,
    detectCharuco,
    clearCalibration,
  };
}
