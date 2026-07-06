// Wet monitoring controls (Tone-0/Tone-1). Native inputs only; knob state lives
// in useToneStore and the controller's subscription pushes it into the running
// chain. This panel never reads post-tone audio (ADR-013) — only the latency
// readout, which is a clock property.
import { useState } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { TONE_PRESETS } from "./presets";
import type { MonitorMode, ToneChainHandles, ToneParams } from "./toneChain";
import { useToneStore } from "./toneStore";

type KnobKey = Exclude<keyof ToneParams, "monitor">;
const KNOBS: { key: KnobKey; label: string; min: number; max: number; step: number }[] = [
  { key: "trimDb", label: "Trim (dB)", min: -24, max: 24, step: 1 },
  { key: "gateDb", label: "Gate (dB)", min: -90, max: -30, step: 1 },
  { key: "drive", label: "Drive", min: 0, max: 1, step: 0.01 },
  { key: "bassDb", label: "Bass (dB)", min: -12, max: 12, step: 1 },
  { key: "midDb", label: "Mid (dB)", min: -12, max: 12, step: 1 },
  { key: "trebleDb", label: "Treble (dB)", min: -12, max: 12, step: 1 },
  { key: "presenceDb", label: "Presence (dB)", min: -12, max: 12, step: 1 },
  { key: "volumeDb", label: "Volume (dB)", min: -60, max: 0, step: 1 },
];

const MONITOR_LABELS: Record<MonitorMode, string> = {
  off: "Off",
  dry: "Clean DI",
  amp: "Amp",
};

export function TonePanel({ tone }: { tone: ToneChainHandles }) {
  const { params, preset, set, applyPreset } = useToneStore();
  const { mics, micId } = useCaptureStore();
  const [irName, setIrName] = useState("");

  // Same mic-label resolution as SetupWizard (ADR-013: hint, not truth).
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const feedbackRisk = classifyAudioInput(micLabel) === "mic" && params.monitor !== "off";

  const loadIR = async (file: File) => {
    await tone.loadIR(await file.arrayBuffer());
    setIrName(file.name);
  };

  return (
    <div className="audio-debug tone-panel">
      <h3>Tone (monitoring)</h3>
      <div className="audio-row">
        <label className="audio-label" htmlFor="tone-monitor">Monitor</label>
        <select
          id="tone-monitor"
          aria-label="Monitor"
          value={params.monitor}
          onChange={(e) => set({ monitor: e.target.value as MonitorMode })}
        >
          {(Object.keys(MONITOR_LABELS) as MonitorMode[]).map((m) => (
            <option key={m} value={m}>{MONITOR_LABELS[m]}</option>
          ))}
        </select>
        <label className="audio-label" htmlFor="tone-preset">Preset</label>
        <select
          id="tone-preset"
          value={preset ?? ""}
          onChange={(e) => e.target.value && applyPreset(e.target.value)}
        >
          <option value="">Custom</option>
          {Object.keys(TONE_PRESETS).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      {feedbackRisk && (
        <p className="wizard-error">Mic input + speakers can feedback — use headphones.</p>
      )}
      {KNOBS.map((k) => (
        <div className="audio-row" key={k.key}>
          <label className="audio-label" htmlFor={`tone-${k.key}`}>{k.label}</label>
          <input
            id={`tone-${k.key}`}
            type="range"
            min={k.min}
            max={k.max}
            step={k.step}
            value={params[k.key]}
            onChange={(e) => set({ [k.key]: Number(e.target.value) })}
          />
          <span className="audio-value">
            {k.step < 1 ? params[k.key].toFixed(2) : params[k.key]}
          </span>
        </div>
      ))}
      <div className="audio-row">
        <label className="audio-label" htmlFor="tone-ir">Cab IR</label>
        <input
          id="tone-ir"
          type="file"
          accept=".wav,audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadIR(f);
          }}
        />
        {irName && <span className="audio-value">{irName}</span>}
      </div>
      <div className="audio-row">
        <span className="audio-label">Latency</span>
        <span className="audio-value">{tone.latencyMs().toFixed(1)} ms output path</span>
      </div>
    </div>
  );
}
