// Wizard v2 (spec §7) — a NEW parallel surface. The old SetupWizard.tsx stays
// untouched and keeps running the app until T6 swaps AppShell over; this
// component is fully mountable + tested standalone.
//
// State machine: 3 steps + progress dots + a persistent `skip setup for now`
// link. Capture start/stop and device logic are LIFTED AS-IS from
// SetupWizard.tsx (that file, controller.ts and captureStore are read-only
// for this task) — this file adds no new capture behavior, only a new home
// for the same calls.
//
// CRITICAL INVARIANT (spec §7): the wizard never stops/restarts capture on
// exit (Continue/Back/skip/Start practicing) — `handlesRef.current.stop()` is
// only ever called here to replace a run with a NEW one (device change /
// retry), exactly as SetupWizard did. Finishing or skipping the wizard leaves
// whatever capture is running untouched so it carries into the practice
// screen.
import { useRef, useState, useSyncExternalStore } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { listCaptureDevices, pickPreferredAudioInput, classifyAudioInput } from "../capture/devices";
import { startCapture, type CaptureHandles } from "../capture/controller";
import { adviseLatency, type LatencyAdvice } from "../capture/latencyAdvice";
import { visionHot, subscribe, getSnapshot } from "../perception/perceptionStore";
import { WizardStep1 } from "./WizardStep1";
import { WizardStep2 } from "./WizardStep2";
import { WizardStep3 } from "./WizardStep3";
import { composeWizardSummary } from "./wizardLogic";
import "./wizard.css";

const SETUP_DONE_KEY = "gt-setup-done";

export interface WizardProps {
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

export function Wizard({ onDone }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlesRef = useRef<CaptureHandles | null>(null);
  const autoPicked = useRef(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const { cameras, mics, cameraId, micId, phase, error, openStringsSeen, setDevices, select, setPhase } =
    useCaptureStore();
  const perceptionSnap = useSyncExternalStore(subscribe, getSnapshot);

  const running = phase === "running";

  // ── capture start (lifted as-is from SetupWizard.tsx) ─────────────────────
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
      // A persisted cameraId/micId can go stale if the device was unplugged
      // since last session; retry once on system defaults (see controller.ts).
      if (err instanceof Error && err.name === "OverconstrainedError" && (videoDeviceId || audioDeviceId)) {
        select({ cameraId: "", micId: "" });
        void start("", ""); // retry once on system defaults
        return;
      }
      setPhase("error", err instanceof Error ? err.message : String(err));
    }
  };

  // ── acoustic round-trip probe (lifted as-is from SetupWizard.tsx) ─────────
  const [probing, setProbing] = useState(false);
  const [latencyMsg, setLatencyMsg] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const measureLatency = async () => {
    if (!handlesRef.current) return;
    setProbing(true);
    setLatencyMsg("Measuring — sit tight for a couple of clicks…");
    setLatencyMs(null);
    try {
      const ms = await handlesRef.current.measureLatency();
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
            videoRef={videoRef}
            videoEl={videoEl}
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
