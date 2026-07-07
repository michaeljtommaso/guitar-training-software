// HintBar (spec §5): the big one-line hint + a mono telemetry sub-line + the
// "tip was wrong" button. Pure relocation of LessonPanel's hint block (spec
// §3 map) — same fusionStore snapshot, same flagTipWrong, no new state.
import { useSyncExternalStore } from "react";
import { getFusionSnapshot, subscribeFusion, flagTipWrong } from "../fusion/fusionStore";
import { fusionHintHistogram } from "../observability/latencyHistogram";
import "./shell.css";

const IDLE_TEXT = "Start a lesson to get real-time feedback.";
const LISTENING_TEXT = "Listening…";

function fmtMs(ms: number): string {
  return Number.isFinite(ms) ? `${Math.round(ms)} ms` : "—";
}

/** "audio+vision" / "audio" / "vision" / "—" — never invents a leg that isn't in evidence. */
function legsLabel(evidence: { audio?: string; vision?: string }): string {
  const legs = [evidence.audio ? "audio" : null, evidence.vision ? "vision" : null].filter(Boolean);
  return legs.length ? legs.join("+") : "—";
}

export function HintBar() {
  const snap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const active = snap.lessonId !== null;
  const hintText = active ? (snap.hint?.text ?? LISTENING_TEXT) : IDLE_TEXT;

  const d = snap.lastDiagnosis;
  const subline = d
    ? `${d.code} · conf ${Math.round(d.conf * 100)}% · hint p50 ${fmtMs(fusionHintHistogram.p50)} · fused ${legsLabel(d.evidence)}`
    : null;

  return (
    <section className="hint-bar" data-testid="hint-bar">
      <p className="hint-bar-text" data-testid="hint-bar-text">
        {hintText}
      </p>
      <div className="hint-bar-footer">
        {subline && (
          <span className="hint-bar-subline" data-testid="hint-bar-subline">
            {subline}
          </span>
        )}
        <button
          type="button"
          className="hint-bar-tip-wrong"
          data-testid="hint-bar-tip-wrong"
          disabled={!snap.hint}
          onClick={flagTipWrong}
          title="Report this tip as wrong (false-feedback metric)"
        >
          tip was wrong
        </button>
      </div>
    </section>
  );
}
