// TelemetryFooter (spec §5): one mono line composed ONLY from fields with a
// real source in perceptionStore/fusionStore/observability histograms — no
// fake data (spec §5 hard rule). `composeTelemetryLine` is a pure function so
// the composition itself is unit-testable from a fixture snapshot (spec §10),
// independent of the stores it's normally wired to.
import { useSyncExternalStore } from "react";
import { subscribe as subscribePerception, getSnapshot as getPerceptionSnapshot } from "../perception/perceptionStore";
import { subscribeFusion, getFusionSnapshot } from "../fusion/fusionStore";
import { audioGlassToWorkerHistogram } from "../observability/latencyHistogram";
import "./shell.css";

export interface TelemetryAudioInputs {
  framesRead: number;
  dropped: number;
  latencyMs: number;
  health?: { rmsDb: number; noiseFloorDb: number };
}

export interface TelemetryInputs {
  backend: "webgpu" | "wasm" | null;
  frameDriver: "rvfc" | "raf" | null;
  audio: TelemetryAudioInputs | null;
  visionFrames: number;
  glassP50: number;
  glassP95: number;
  diagnoses: number;
  hints: number;
  /** No store carries this yet (needs a live CaptureHandles.tone reference,
   *  which TelemetryFooter — a store-only reader — doesn't own). Omitted
   *  unless a caller supplies it (Wave C, once AppShell holds the handle). */
  toneLatencyMs?: number;
  tonePresetLabel?: string;
}

/** Pure composition — every segment gated on a real value being present. */
export function composeTelemetryLine(t: TelemetryInputs): string {
  const parts: string[] = [];
  if (t.backend) parts.push(t.backend);
  if (t.frameDriver) parts.push(t.frameDriver === "rvfc" ? "rVFC" : "rAF");
  if (t.audio && Number.isFinite(t.audio.latencyMs)) {
    const hasHist = Number.isFinite(t.glassP50) && Number.isFinite(t.glassP95);
    const hist = hasHist ? ` (p50 ${t.glassP50.toFixed(1)} / p95 ${t.glassP95.toFixed(1)})` : "";
    parts.push(`glass→worker ${t.audio.latencyMs.toFixed(1)} ms${hist}`);
  }
  parts.push(`vision ${t.visionFrames} fr`);
  if (t.audio) {
    parts.push(`ring ${t.audio.framesRead} rd`);
    parts.push(`drop ${t.audio.dropped}`);
  }
  parts.push(`diag ${t.diagnoses}`);
  parts.push(`hints ${t.hints}`);
  if (t.audio?.health) {
    parts.push(`in ${t.audio.health.rmsDb.toFixed(0)} dB / floor ${t.audio.health.noiseFloorDb.toFixed(0)}`);
  }
  if (typeof t.toneLatencyMs === "number" && Number.isFinite(t.toneLatencyMs)) {
    const label = t.tonePresetLabel ? `tone ${t.tonePresetLabel} ` : "tone ";
    parts.push(`${label}${t.toneLatencyMs.toFixed(1)} ms`);
  }
  return parts.join(" · ");
}

const SETUP_DONE_KEY = "gt-setup-done";

export interface TelemetryFooterProps {
  consoleOpen: boolean;
  onToggleConsole: () => void;
  /** Wave C: clear routing back to the wizard. Called AFTER the local
   *  `gt-setup-done` flag is cleared (best-effort; see try/catch below). */
  onRerunWizard?: () => void;
  toneLatencyMs?: number;
  tonePresetLabel?: string;
}

export function TelemetryFooter({
  consoleOpen,
  onToggleConsole,
  onRerunWizard,
  toneLatencyMs,
  tonePresetLabel,
}: TelemetryFooterProps) {
  const perception = useSyncExternalStore(subscribePerception, getPerceptionSnapshot);
  const fusion = useSyncExternalStore(subscribeFusion, getFusionSnapshot);

  const line = composeTelemetryLine({
    backend: perception.backend,
    frameDriver: perception.frameDriver,
    audio: perception.audio,
    visionFrames: perception.visionFrames,
    glassP50: audioGlassToWorkerHistogram.p50,
    glassP95: audioGlassToWorkerHistogram.p95,
    diagnoses: fusion.counts.diagnoses,
    hints: fusion.counts.hints,
    toneLatencyMs,
    tonePresetLabel,
  });

  const rerunWizard = () => {
    try {
      localStorage.removeItem(SETUP_DONE_KEY);
    } catch {
      /* best-effort — same convention as theme.ts persistence */
    }
    onRerunWizard?.();
  };

  return (
    <footer className="telemetry-footer" data-testid="telemetry-footer">
      <span className="telemetry-footer-line" data-testid="telemetry-footer-line">
        {line}
      </span>
      <span className="telemetry-footer-actions">
        <button type="button" data-testid="telemetry-footer-wizard" onClick={rerunWizard}>
          setup wizard
        </button>
        <button
          type="button"
          data-testid="telemetry-footer-console"
          aria-pressed={consoleOpen}
          onClick={onToggleConsole}
        >
          {consoleOpen ? "close console ▴" : "console ▴"}
        </button>
      </span>
    </footer>
  );
}
