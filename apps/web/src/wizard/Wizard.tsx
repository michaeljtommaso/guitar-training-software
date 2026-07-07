// Wizard v2 (spec §7) — the one-time 3-step setup flow.
//
// State machine: 3 steps + progress dots + a persistent `skip setup for now`
// link. Capture start/device logic lives in the shared CaptureHost
// (shell/useCaptureHost.ts, owned by AppShell — T6): the wizard drives
// `capture.start(...)` and reads `capture.handles`, but never owns the video
// element or the CaptureHandles itself.
//
// CRITICAL INVARIANT (spec §7): the wizard never stops/restarts capture on
// exit (Continue/Back/skip/Start practicing) — the host's start() only stops
// a previous run to replace it with a NEW one (device change / retry).
// Finishing or skipping the wizard leaves the running capture untouched, and
// because AppShell owns the host, the SAME handles + video element carry
// straight into the practice screen.
import { useState, useSyncExternalStore } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { adviseLatency, type LatencyAdvice } from "../capture/latencyAdvice";
import { visionHot, subscribe, getSnapshot } from "../perception/perceptionStore";
import type { CaptureHost } from "../shell/useCaptureHost";
import { WizardStep1 } from "./WizardStep1";
import { WizardStep2 } from "./WizardStep2";
import { WizardStep3 } from "./WizardStep3";
import { composeWizardSummary } from "./wizardLogic";
import "./wizard.css";

const SETUP_DONE_KEY = "gt-setup-done";

export interface WizardProps {
  /** The shared capture host (owned by AppShell). */
  capture: CaptureHost;
  /** Called after `gt-setup-done` is set — both on "Start practicing" and on
   *  "skip setup for now" (spec §5: skip sets the flag too). Never implies
   *  capture was stopped. */
  onDone(): void;
}

function markSetupDone(): void {
  try {
    localStorage.setItem(SETUP_DONE_KEY, "true");
  } catch {
    /* best-effort — a blocked localStorage just re-shows the wizard next load */
  }
}

export function Wizard({ capture, onDone }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const { cameras, mics, cameraId, micId, phase, error, openStringsSeen, select } = useCaptureStore();
  const perceptionSnap = useSyncExternalStore(subscribe, getSnapshot);

  const running = phase === "running";
  const start = capture.start;

  // ── acoustic round-trip probe (lifted from the old SetupWizard.tsx) ───────
  const [probing, setProbing] = useState(false);
  const [latencyMsg, setLatencyMsg] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const measureLatency = async () => {
    if (!capture.handles) return;
    setProbing(true);
    setLatencyMsg("Measuring — sit tight for a couple of clicks…");
    setLatencyMs(null);
    try {
      const ms = await capture.handles.measureLatency();
      setLatencyMs(ms);
      setLatencyMsg(
        ms === null
          ? "No signal detected — use speakers, not headphones, and turn input gain up."
          : `~${Math.round(ms)} ms round trip`,
      );
    } finally {
      setProbing(false);
    }
  };

  // ADR-013 classification: a hint, not truth (see devices.ts) — same lookup
  // SetupWizard/TopBar use.
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const cameraLabel = cameras.find((c) => c.deviceId === cameraId)?.label ?? cameras[0]?.label ?? "";
  const kind = classifyAudioInput(micLabel);
  const latencyAdvice: LatencyAdvice | null = latencyMs === null ? null : adviseLatency(latencyMs, kind);

  const finish = () => {
    markSetupDone();
    onDone(); // capture is never stopped here — see the invariant note above.
  };

  const skip = () => {
    markSetupDone();
    onDone();
  };

  const summary = composeWizardSummary({
    cameraLabel,
    calibrated: visionHot.H !== null,
    inputLabel: micLabel,
    inputKind: kind,
    inputLevelDb: perceptionSnap.audio?.health?.rmsDb ?? null,
    openStringsSeen,
    latencyMs,
  });

  return (
    <div className="wizard" data-testid="wizard">
      <header className="wizard-header">
        <h1>Guitar tutor</h1>
        <p className="wizard-subtitle">one-time setup · under a minute</p>
        <div className="wizard-dots" data-testid="wizard-progress">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`wizard-dot${step >= n ? " active" : ""}`} />
          ))}
        </div>
      </header>

      <div className="wizard-card" data-testid={`wizard-step-${step}`}>
        {step === 1 && (
          <WizardStep1
            video={capture.video}
            cameras={cameras}
            mics={mics}
            cameraId={cameraId}
            micId={micId}
            phase={phase}
            error={error}
            kind={kind}
            onSelectCamera={(id) => {
              select({ cameraId: id });
              if (running) void start(id, micId);
            }}
            onSelectMic={(id) => {
              select({ micId: id });
              // A measurement belongs to the device it was taken on.
              setLatencyMs(null);
              setLatencyMsg("");
              if (running) void start(cameraId, id);
            }}
            onStart={() => void start(cameraId, micId)}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <WizardStep2
            probing={probing}
            latencyMsg={latencyMsg}
            latencyAdvice={latencyAdvice}
            onMeasure={() => void measureLatency()}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && <WizardStep3 summary={summary} onBack={() => setStep(2)} onFinish={finish} />}
      </div>

      <button type="button" className="wizard-skip" data-testid="wizard-skip" onClick={skip}>
        skip setup for now
      </button>
    </div>
  );
}
