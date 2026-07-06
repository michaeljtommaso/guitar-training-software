// Live input meter (ADR-013 wizard): RMS bar, peak tick, clip light, noise
// floor. Reads the coarse perception snapshot at worker-stats cadence.
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";

const pct = (dbVal: number) => Math.max(0, Math.min(1, (dbVal + 60) / 60)); // -60..0 dBFS → 0..1

export function InputMeter() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const h = snap.audio?.health;
  if (!h) return null;
  const hot = h.clipped;
  const quiet = h.rmsDb < -45;
  const noisy = h.noiseFloorDb > -50;
  return (
    <div className="input-meter">
      <span className="audio-label">Input</span>
      <span className="meter-track">
        <span className="meter-fill" style={{ transform: `scaleX(${pct(h.rmsDb).toFixed(3)})` }} />
        <span className="meter-peak" style={{ left: `${(pct(h.peakDb) * 100).toFixed(1)}%` }} />
      </span>
      <span className={`clip-light ${hot ? "lit" : ""}`}>clip</span>
      <span className="audio-value">
        {h.rmsDb.toFixed(0)} dB · floor {h.noiseFloorDb.toFixed(0)} dB
      </span>
      {hot && <span className="wizard-error">Clipping — lower your interface gain.</span>}
      {!hot && noisy && <span className="wizard-tip">Noisy input — check cable/gain.</span>}
      {!hot && !noisy && quiet && <span className="wizard-tip">Very quiet — raise interface gain and play.</span>}
    </div>
  );
}
