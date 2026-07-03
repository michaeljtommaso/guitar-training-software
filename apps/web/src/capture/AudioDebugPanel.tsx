// WP-2 audio debug readout: live chord posterior bars, tuner (string / cents /
// f0), Basic Pitch detected pitches, and onset activity. Coarse state read from
// the module store at worker cadence (~10 Hz), never per audio frame. All
// numerals IBM Plex Mono + tabular-nums (design signature).
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "../perception/perceptionStore";
import { midiName } from "../perception/audio/dsp/pitch";

// String label for the tuner readout (1-based → name).
const STRING_NAMES = ["E2", "A2", "D3", "G3", "B3", "E4"];

function centsClass(cents: number): string {
  const a = Math.abs(cents);
  if (a <= 5) return "in-tune";
  if (a <= 15) return "near";
  return "off";
}

export function AudioDebugPanel() {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const a = snap.audioAnalysis;
  const chord = a?.chord ?? null;
  const tuning = a?.tuning ?? null;
  const onsetRecent = Number.isFinite(snap.lastOnsetT);

  return (
    <section className="audio-debug">
      <h3>Audio perception (WP-2)</h3>

      <div className="audio-row">
        <span className="audio-label">Chord</span>
        <span className="audio-value">
          {chord ? `${chord.label} · ${(chord.conf * 100).toFixed(0)}%` : "—"}
        </span>
        <span className={`onset-dot ${onsetRecent ? "lit" : ""}`} title="last onset">
          onset {snap.eventCounts.onset}
        </span>
      </div>

      <div className="chord-posterior">
        {(chord?.posterior ?? []).map((p) => (
          <div key={p.label} className="posterior-bar">
            <span className="posterior-name">{p.label}</span>
            <span className="posterior-track">
              <span
                className={`posterior-fill ${chord && chord.label === p.label ? "top" : ""}`}
                style={{ transform: `scaleX(${p.p.toFixed(3)})` }}
              />
            </span>
            <span className="posterior-pct">{(p.p * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="audio-row">
        <span className="audio-label">Tuner</span>
        <span className="audio-value">
          {tuning
            ? `${STRING_NAMES[tuning.string - 1] ?? tuning.name} · ${tuning.f0.toFixed(1)} Hz`
            : "—"}
        </span>
        {tuning && (
          <span className={`cents ${centsClass(tuning.cents)}`}>
            {tuning.cents >= 0 ? "+" : ""}
            {tuning.cents.toFixed(1)}¢
          </span>
        )}
      </div>

      <div className="audio-row">
        <span className="audio-label">Notes</span>
        <span className="audio-value">
          {snap.notes && snap.notes.pitches.length
            ? snap.notes.pitches.map(midiName).join(" ")
            : "—"}
        </span>
        <span className="audio-count">bp {snap.eventCounts.notes}</span>
      </div>
    </section>
  );
}
