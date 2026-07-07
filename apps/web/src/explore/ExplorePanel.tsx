// Explore-mode control panel (v1-thin): pick a chord or scale, see it on the
// schematic FretboardStrip. Native inputs, reuses the existing "audio-debug"
// panel shell (same idiom as AudioDebugPanel/TonePanel) — the v2-UI project
// reskins this chrome. No store reads happen inside FretboardStrip itself;
// this panel is the bridge between local UI selection state and the
// exploreStore target.
import { useEffect, useState } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { CHORD_ROOTS, chordSuffixes } from "../theory/chords";
import { SCALE_TYPES, type ScaleType } from "../theory/scales";
import { useExploreStore, currentResolvedTier, type FeedbackTier } from "./exploreStore";
import { FretboardStrip } from "./FretboardStrip";

const FALLBACK_SUFFIXES = ["major", "minor"];

export function ExplorePanel() {
  const { target, loadError, tier, setTier, setVoicing } = useExploreStore();
  const { mics, micId } = useCaptureStore();

  const [kind, setKind] = useState<"chord" | "scale">("chord");
  const [root, setRoot] = useState<string>(CHORD_ROOTS[0]);
  const [suffix, setSuffix] = useState<string>("major");
  const [scaleType, setScaleType] = useState<ScaleType>("major");
  const [suffixes, setSuffixes] = useState<string[]>(FALLBACK_SUFFIXES);

  useEffect(() => {
    let cancelled = false;
    chordSuffixes()
      .then((s) => {
        if (!cancelled) setSuffixes(s);
      })
      .catch(() => {
        if (!cancelled) setSuffixes(FALLBACK_SUFFIXES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickChord = (nextRoot: string, nextSuffix: string) => {
    void useExploreStore.getState().setChord(nextRoot, nextSuffix);
  };
  const pickScale = (nextRoot: string, nextType: ScaleType) => {
    useExploreStore.getState().setScale(nextRoot, nextType);
  };

  const handleKindChord = () => {
    setKind("chord");
    pickChord(root, suffix);
  };
  const handleKindScale = () => {
    setKind("scale");
    pickScale(root, scaleType);
  };
  const handleRootChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setRoot(next);
    if (kind === "chord") pickChord(next, suffix);
    else pickScale(next, scaleType);
  };
  const handleSuffixChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setSuffix(next);
    pickChord(root, next);
  };
  const handleScaleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ScaleType;
    setScaleType(next);
    pickScale(root, next);
  };

  // ADR-013-style classification, reused here purely for the tier readout —
  // currentResolvedTier() does the same lookup internally for the actual
  // resolution used by feedback.ts.
  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const micKind = classifyAudioInput(micLabel);
  const resolved = currentResolvedTier();

  const chordTarget = target?.kind === "chord" ? target : null;
  const voicing = chordTarget?.voicings[chordTarget.active];

  return (
    <section className="audio-debug explore-panel">
      <h3>Explore</h3>
      <div className="wizard-controls">
        <button
          type="button"
          data-testid="explore-kind-chord"
          className={kind === "chord" ? "active" : ""}
          onClick={handleKindChord}
        >
          Chord
        </button>
        <button
          type="button"
          data-testid="explore-kind-scale"
          className={kind === "scale" ? "active" : ""}
          onClick={handleKindScale}
        >
          Scale
        </button>
        <label>
          Root{" "}
          <select data-testid="explore-root" value={root} onChange={handleRootChange}>
            {CHORD_ROOTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {kind === "chord" ? (
          <label>
            Suffix{" "}
            <select data-testid="explore-suffix" value={suffix} onChange={handleSuffixChange}>
              {suffixes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Scale{" "}
            <select
              data-testid="explore-scale-type"
              value={scaleType}
              onChange={handleScaleTypeChange}
            >
              {SCALE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="wizard-controls">
        <label>
          Feedback{" "}
          <select
            data-testid="explore-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as FeedbackTier)}
          >
            <option value="auto">auto</option>
            <option value="light">light</option>
            <option value="full">full</option>
          </select>
        </label>
        <span className="audio-count">
          {tier === "auto" ? `auto → ${resolved} (${micKind})` : tier}
        </span>
      </div>

      {loadError && (
        <div className="audio-row">
          <span className="audio-value wizard-error">{loadError}</span>
          <button type="button" onClick={() => pickChord(root, suffix)}>
            Retry
          </button>
        </div>
      )}

      {target && (
        <>
          <FretboardStrip target={target} />
          {chordTarget && voicing && (
            <div className="wizard-controls">
              <button
                type="button"
                data-testid="explore-voicing-prev"
                disabled={chordTarget.active <= 0}
                onClick={() => setVoicing(chordTarget.active - 1)}
              >
                ‹
              </button>
              <span data-testid="explore-voicing-label" className="audio-count">
                voicing {chordTarget.active + 1}/{chordTarget.voicings.length}
              </span>
              <button
                type="button"
                data-testid="explore-voicing-next"
                disabled={chordTarget.active >= chordTarget.voicings.length - 1}
                onClick={() => setVoicing(chordTarget.active + 1)}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
