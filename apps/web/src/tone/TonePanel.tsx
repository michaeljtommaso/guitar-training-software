// Wet monitoring controls (Tone-0/Tone-1). Native inputs only; knob state lives
// in useToneStore and the controller's subscription pushes it into the running
// chain. This panel never reads post-tone audio (ADR-013) — only the latency
// readout, which is a clock property.
import { useRef, useState, type CSSProperties } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { BUNDLED_CABINETS } from "./cabinets";
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
  const { params, set } = useToneStore();
  const { mics, micId } = useCaptureStore();
  const [irName, setIrName] = useState("");

  // Same mic-label resolution as SetupWizard (ADR-013: hint, not truth).
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const feedbackRisk = classifyAudioInput(micLabel) === "mic" && params.monitor !== "off";

  // Cab source: "synthetic" (built-in default IR), a bundled CC0 cabinet id
  // (public/irs/, see cabinets.ts + MANIFEST.md), or "custom" (a user-loaded
  // file). Synthetic stays the default fallback.
  const [cab, setCab] = useState<string>("synthetic");

  const loadIR = async (file: File) => {
    await tone.loadIR(await file.arrayBuffer());
    setIrName(file.name);
    setCab("custom");
  };

  // Monotonic token so rapid cab switches can't apply out of order (the fetch
  // that RESOLVES last must not win over the cab SELECTED last) and a failed
  // load can't clobber state.
  const cabReqRef = useRef(0);
  const selectCab = async (value: string) => {
    const req = ++cabReqRef.current;
    try {
      if (value === "synthetic") {
        await tone.resetIR();
        if (req !== cabReqRef.current) return; // superseded by a newer selection
        setIrName("");
        setCab("synthetic");
        return;
      }
      const bundled = BUNDLED_CABINETS.find((c) => c.id === value);
      if (!bundled) return;
      const res = await fetch(bundled.file);
      if (!res.ok) throw new Error(`fetch ${bundled.file}: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (req !== cabReqRef.current) return; // superseded — don't touch the convolver
      await tone.loadIR(buf);
      if (req !== cabReqRef.current) return; // superseded mid-decode — leave UI to the winner
      setIrName(bundled.label);
      setCab(bundled.id);
    } catch (err) {
      // Convolver keeps the previous IR and the controlled <select> snaps back
      // to `cab`, so the UI stays truthful; just don't swallow the evidence.
      console.error(`[tone] cab load failed (${value}):`, err);
    }
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
        {/* Preset selection lives in the TopBar (v2-ui spec §3) — the panel
            keeps monitor/knobs/cab/latency only. */}
      </div>
      {feedbackRisk && (
        <p className="wizard-error">Mic input + speakers can feedback — use headphones.</p>
      )}
      {KNOBS.map((k) => {
        const val = params[k.key];
        // Filled-range %, consumed by the slider's track gradient (--fill).
        const pct = ((val - k.min) / (k.max - k.min)) * 100;
        return (
          <div className="audio-row" key={k.key}>
            <label className="audio-label" htmlFor={`tone-${k.key}`}>{k.label}</label>
            <input
              id={`tone-${k.key}`}
              className="ui-slider"
              type="range"
              min={k.min}
              max={k.max}
              step={k.step}
              value={val}
              style={{ "--fill": `${pct}%` } as CSSProperties}
              onChange={(e) => set({ [k.key]: Number(e.target.value) })}
            />
            <span className="audio-value">{k.step < 1 ? val.toFixed(2) : val}</span>
          </div>
        );
      })}
      <div className="audio-row">
        <label className="audio-label" htmlFor="tone-cab">Cab</label>
        <select
          id="tone-cab"
          aria-label="Cab"
          value={cab}
          onChange={(e) => void selectCab(e.target.value)}
        >
          <option value="synthetic">Synthetic (default)</option>
          {BUNDLED_CABINETS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
          {cab === "custom" && <option value="custom">Custom: {irName || "loaded file"}</option>}
        </select>
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
