// Debug readout: selected devices, capability probe result, ring-buffer
// stats, measured glass-to-worker latency. Coarse state only — updates at
// worker stat cadence (~2 Hz), not per frame.
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";
import { useCaptureStore } from "./captureStore";

export function DebugPanel() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const { cameras, mics, cameraId, micId } = useCaptureStore();
  const cam = cameras.find((c) => c.deviceId === cameraId);
  const mic = mics.find((m) => m.deviceId === micId);
  const a = snap.audio;

  return (
    <dl className="debug-panel">
      <dt>Camera</dt>
      <dd>{cam?.label || "default"}</dd>
      <dt>Microphone</dt>
      <dd>{mic?.label || "default"}</dd>
      <dt>Backend probe</dt>
      <dd>{snap.backend ?? "-"}</dd>
      <dt>Frame driver</dt>
      <dd>{snap.frameDriver ?? "-"}</dd>
      <dt>Ring frames read</dt>
      <dd>{a?.framesRead ?? 0}</dd>
      <dt>Samples consumed</dt>
      <dd>{a?.samplesConsumed ?? 0}</dd>
      <dt>Dropped frames</dt>
      <dd>{a?.dropped ?? 0}</dd>
      <dt>Glass-to-worker latency</dt>
      <dd>{a && Number.isFinite(a.latencyMs) ? `${a.latencyMs.toFixed(2)} ms` : "-"}</dd>
      <dt>Vision frames</dt>
      <dd>{snap.visionFrames}</dd>
    </dl>
  );
}
