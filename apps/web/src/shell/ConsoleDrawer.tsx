// ConsoleDrawer (spec §5): slide-up panel hosting the relocated debug/tone
// panels — Audio (AudioDebugPanel), Tone (TonePanel — its preset dropdown was
// removed in T6; presets live in TopBar per spec §3), System (DebugPanel),
// Inputs (device selects + re-run latency probe + stop/restart capture — the
// restart path exists because AppShell's CaptureHost owns the video element,
// so a drawer with no video mount of its own can still (re)start capture
// through the `onRestartCapture` callback).
//
// Review fix (carried from Wave A): AppShell's backtick handler toggles the
// drawer even while the user is typing (e.g. a backtick in the coach
// question box). This component owns its OWN key handling with the missing
// guard, and exports `isEditableTarget` so AppShell can adopt the same guard
// if Wave C prefers to keep the listener up there instead (see report for
// the recommended wiring).
import { useEffect, useState } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { adviseLatency } from "../capture/latencyAdvice";
import { AudioDebugPanel } from "../capture/AudioDebugPanel";
import { DebugPanel } from "../capture/DebugPanel";
import type { CaptureHandles } from "../capture/controller";
import { TonePanel } from "../tone/TonePanel";
import "./shell.css";

/** True when `target` is a form control / contenteditable — the backtick
 *  hotkey must not fire while the user is typing into one (spec fix). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.getAttribute("contenteditable") === "true"
  );
}

export interface ConsoleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live capture handles, or null when capture isn't running. Tone/Inputs
   *  sections degrade gracefully (no fake controls) when null. */
  handles: CaptureHandles | null;
  /** Owns the stop action when provided (AppShell wires the CaptureHost's
   *  stop(), which also resets phase/host state). Without it the drawer falls
   *  back to stopping the handles + resetting the phase itself. */
  onStopCapture?: () => void;
  /** (Re)starts capture on the CURRENT captureStore device selection — wired
   *  by AppShell to the CaptureHost (which owns the video element). Also
   *  invoked after a device change while running, preserving the old
   *  SetupWizard behavior of restarting on the newly selected device. */
  onRestartCapture?: () => void;
  /** Enable/disable the drawer's own global hotkey listener. Default true —
   *  set false if a caller wants to own key handling itself instead. */
  enableHotkey?: boolean;
  /** Layout mode. `bottom` (default) = the fixed slide-up overlay; `column` =
   *  a static, full-height panel docked as a practice-grid column (spec v2-ui:
   *  console as a permanent, toggleable third column right of the coach). */
  dock?: "bottom" | "column";
}

export function ConsoleDrawer({
  open,
  onOpenChange,
  handles,
  onStopCapture,
  onRestartCapture,
  enableHotkey = true,
  dock = "bottom",
}: ConsoleDrawerProps) {
  useEffect(() => {
    if (!enableHotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`") {
        if (isEditableTarget(e.target)) return; // spec fix: don't fight typing
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape") {
        if (isEditableTarget(e.target)) return; // same guard as backtick — don't steal Escape from inputs/selects
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, enableHotkey]);

  const { cameras, mics, cameraId, micId, phase, select } = useCaptureStore();
  const running = phase === "running";
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const kind = classifyAudioInput(micLabel);

  const [probing, setProbing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyMsg, setLatencyMsg] = useState("");

  const measure = async () => {
    if (!handles) return;
    setProbing(true);
    setLatencyMsg("Measuring — sit tight for a couple of clicks…");
    setLatencyMs(null);
    try {
      const ms = await handles.measureLatency();
      setLatencyMs(ms);
      setLatencyMsg(ms === null ? "No signal detected." : `~${Math.round(ms)} ms round trip`);
    } finally {
      setProbing(false);
    }
  };
  const advice = latencyMs === null ? null : adviseLatency(latencyMs, kind);

  const stopCapture = () => {
    if (onStopCapture) {
      onStopCapture(); // the owner (CaptureHost) stops + resets phase itself
      return;
    }
    handles?.stop();
    useCaptureStore.getState().setPhase("idle");
  };

  return (
    <div className="console-drawer" data-testid="console-drawer" data-dock={dock} data-open={open} hidden={!open}>
      <div className="console-drawer-header">
        <span className="console-drawer-title">CONSOLE</span>
        <button type="button" data-testid="console-drawer-close" onClick={() => onOpenChange(false)}>
          close ✕
        </button>
      </div>

      <div className="console-drawer-grid">
        <section className="console-section" data-testid="console-section-audio">
          <h4>AUDIO</h4>
          <AudioDebugPanel />
        </section>

        <section className="console-section" data-testid="console-section-tone">
          <h4>TONE</h4>
          {handles ? (
            <TonePanel tone={handles.tone} />
          ) : (
            <p className="console-empty">Start capture to enable tone controls.</p>
          )}
        </section>

        <section className="console-section" data-testid="console-section-system">
          <h4>SYSTEM</h4>
          <DebugPanel />
        </section>

        <section className="console-section" data-testid="console-section-inputs">
          <h4>INPUTS</h4>
          <div className="wizard-controls">
            <label>
              Camera{" "}
              <select
                value={cameraId}
                onChange={(e) => {
                  select({ cameraId: e.target.value });
                  // Old SetupWizard behavior: changing a device while running
                  // restarts capture on the new device (select() has already
                  // written it, so the zero-arg restart picks it up).
                  if (running) onRestartCapture?.();
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
                  // A measurement belongs to the device it was taken on —
                  // clear it so stale ms never gets advice-tiered against the
                  // new mic's kind (same rule the wizard applies).
                  setLatencyMs(null);
                  setLatencyMsg("");
                  if (running) onRestartCapture?.();
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
            <span className={`input-kind ${kind}`}>{kind}</span>
          </div>
          <div className="wizard-controls">
            <button
              type="button"
              data-testid="console-measure-latency"
              disabled={!handles || probing}
              onClick={() => void measure()}
            >
              {probing ? "Measuring…" : "Re-run round-trip"}
            </button>
            {latencyMsg && <span className="wizard-tip">{latencyMsg}</span>}
            {advice && (
              <span
                data-testid="console-latency-advice"
                className={`wizard-tip latency-advice latency-advice-${advice.tier}`}
              >
                {advice.message}
              </span>
            )}
          </div>
          <div className="wizard-controls">
            <button type="button" data-testid="console-stop-capture" disabled={!handles} onClick={stopCapture}>
              Stop capture
            </button>
            {onRestartCapture && (
              <button type="button" data-testid="console-restart-capture" onClick={onRestartCapture}>
                {handles ? "Restart capture" : "Start capture"}
              </button>
            )}
            {!handles && !onRestartCapture && (
              <span className="wizard-tip">Capture isn't running — start it from the camera pane or setup wizard.</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
