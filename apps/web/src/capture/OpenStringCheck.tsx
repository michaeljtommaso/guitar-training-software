// "Strum each open string" sanity check (ADR-013): proves signal per string
// on the chosen input. A chip lights when the tuner reports that open string
// within ±50 cents.
import { useRef, useState, useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";

const OPEN_STRINGS = ["E2", "A2", "D3", "G3", "B3", "E4"] as const;

export function OpenStringCheck() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const lastReading = useRef("");
  const t = snap.audioAnalysis?.tuning;
  const key = t ? `${t.name}:${t.f0.toFixed(1)}` : "";
  if (t && key !== lastReading.current) {
    lastReading.current = key;
    if ((OPEN_STRINGS as readonly string[]).includes(t.name) && Math.abs(t.cents) <= 50 && !seen.has(t.name)) {
      setSeen(new Set(seen).add(t.name));
    }
  }
  return (
    <div className="open-string-check">
      <span className="audio-label">Open strings</span>
      {OPEN_STRINGS.map((s) => (
        <span key={s} className={`string-chip ${seen.has(s) ? "seen" : ""}`}>{s}</span>
      ))}
      <span className="audio-value">{seen.size}/6</span>
      <button type="button" onClick={() => setSeen(new Set())}>Reset</button>
    </div>
  );
}
