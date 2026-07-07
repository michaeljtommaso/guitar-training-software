// ConsoleDrawer (spec §5): slide-up panel hosting the relocated debug/tone
// panels — Audio (AudioDebugPanel), Tone (TonePanel minus the preset
// dropdown — the dropdown itself lives in TopBar per spec §3), System
// (DebugPanel), Inputs (device selects + re-run latency probe + stop
// capture). All four are the EXISTING components, mounted as-is; only the
// preset <select> is hidden (CSS-only — TonePanel itself is out of bounds
// for this task, see report).
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
  /** Called after a successful `handles.stop()` (Wave C: clear routing/UI
   *  state that lives outside this component). */
  onStopCapture?: () => void;
  /** Enable/disable the drawer's own global hotkey listener. Default true —
   *  set false if a caller wants to own key handling itself instead. */
  enableHotkey?: boolean;
}

export function ConsoleDrawer({
  open,
  onOpenChange,
  handles,
  onStopCapture,
  enableHotkey = true,
}: ConsoleDrawerProps) {
  useEffect(() => {
    if (!enableHotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`") {
        if (isEditableTarget(e.target)) return; // spec fix: don't fight typing
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, enableHotkey]);

  const { cameras, mics, cameraId, micId, select } = useCaptureStore();
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
    handles?.stop();
    useCaptureStore.getState().setPhase("idle");
    onStopCapture?.();
  };

  return (
    <div className="console-drawer" data-testid="console-drawer" data-open={open} hidden={!open}>
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

        <section className="console-section console-section--hide-preset" data-testid="console-section-tone">
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
              <select value={cameraId} onChange={(e) => select({ cameraId: e.target.value })}>
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
              <select value={micId} onChange={(e) => select({ micId: e.target.value })}>
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
            {!handles && (
              <span className="wizard-tip">Capture isn't running — start it from the camera pane or setup wizard.</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
