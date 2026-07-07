// Wizard step 1 — Camera & input (spec §7). Device selects + direct-input
// badge + Start capture; once running, shows the two preview panes (full
// scene video + the SAME ZoomPane component at preview size — reuse, not a
// copy) and flips the primary button to a disabled "Capturing ✓" state.
//
// The <video> element is the capture host's SINGLETON node (see
// shell/useCaptureHost.ts) — `VideoMount` physically appends the same element
// here, so startCapture's stream/frame-pump wiring survives step changes and
// the wizard→practice transition. The preview grid still only toggles the
// `hidden` attribute with `running` so the element stays in the document.
import { ZoomPane } from "../shell/ZoomPane";
import { VideoMount } from "../shell/VideoMount";
import type { AudioInputKind } from "../capture/devices";
import type { CapturePhase } from "../capture/captureStore";
import { isDirectInput } from "./wizardLogic";

export interface WizardStep1Props {
  /** The capture host's singleton video element (mounted via VideoMount). */
  video: HTMLVideoElement;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  cameraId: string;
  micId: string;
  phase: CapturePhase;
  error: string | null;
  kind: AudioInputKind;
  onSelectCamera(id: string): void;
  onSelectMic(id: string): void;
  onStart(): void;
  onContinue(): void;
}

export function WizardStep1({
  video,
  cameras,
  mics,
  cameraId,
  micId,
  phase,
  error,
  kind,
  onSelectCamera,
  onSelectMic,
  onStart,
  onContinue,
}: WizardStep1Props) {
  const running = phase === "running";

  return (
    <>
      <h2>Camera &amp; input</h2>
      <p className="wizard-copy">
        One camera sees the whole scene — the tutor crops a zoomed fretboard view from the same feed,
        so frame yourself with the neck clearly visible. Plug your guitar into a USB interface for the
        most accurate feedback; a bare mic works too.
      </p>

      <div className="wizard-field">
        <label className="wizard-field-label" htmlFor="wizard-camera-select">
          Camera
        </label>
        <select
          id="wizard-camera-select"
          data-testid="wizard-camera-select"
          value={cameraId}
          onChange={(e) => onSelectCamera(e.target.value)}
        >
          <option value="">Default camera</option>
          {cameras.map((c) => (
            <option key={c.deviceId} value={c.deviceId}>
              {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </div>

      <div className="wizard-field">
        <label className="wizard-field-label" htmlFor="wizard-mic-select">
          Audio input
        </label>
        <div className="wizard-field-row">
          <select
            id="wizard-mic-select"
            data-testid="wizard-mic-select"
            value={micId}
            onChange={(e) => onSelectMic(e.target.value)}
          >
            <option value="">Default microphone</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Microphone ${m.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          {isDirectInput(kind) && (
            <span className="wizard-badge" data-testid="wizard-direct-input-badge">
              direct input
            </span>
          )}
        </div>
      </div>

      {phase === "error" && (
        <p className="wizard-error" data-testid="wizard-capture-error">
          Could not start capture: {error}
        </p>
      )}

      <div className="wizard-preview-grid" data-testid="wizard-preview" hidden={!running}>
        <div className="wizard-preview-pane" data-testid="wizard-preview-full">
          <VideoMount video={video} />
          <span className="wizard-preview-caption">full scene</span>
        </div>
        <div className="wizard-preview-pane wizard-preview-pane--zoom" data-testid="wizard-preview-zoom">
          {/* Uncalibrated at this point → ZoomPane's own schematic fallback renders;
              the "calibrate on the practice screen" hint lives in its fallback copy. */}
          <ZoomPane video={running ? video : null} variant="preview" />
        </div>
      </div>
      {running && (
        <p className="wizard-copy-muted" data-testid="wizard-calibrate-hint">
          calibrate on the practice screen
        </p>
      )}

      <div className="wizard-actions">
        {running ? (
          <button type="button" className="wizard-btn-captured" data-testid="wizard-capturing" disabled>
            Capturing ✓
          </button>
        ) : (
          <button
            type="button"
            className="wizard-btn-primary"
            data-testid="wizard-start-capture"
            disabled={phase === "starting"}
            onClick={onStart}
          >
            {phase === "starting" ? "Starting…" : "Start capture"}
          </button>
        )}
        <button
          type="button"
          className="wizard-btn-primary"
          data-testid="wizard-step1-continue"
          disabled={!running}
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </>
  );
}
