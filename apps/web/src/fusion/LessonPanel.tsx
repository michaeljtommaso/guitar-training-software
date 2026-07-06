// WP-4 minimal lesson UI: pick a lesson, see the target chord + canonical
// fingering, the fused per-string status, and the current one-line hint.
// Coarse state only — fusion updates arrive at diagnosis cadence (≤4 Hz),
// never per frame (ADR-002).
import { useSyncExternalStore } from "react";
import {
  getFusionSnapshot,
  subscribeFusion,
  startLesson,
  stopLesson,
  setStep,
  flagTipWrong,
} from "./fusionStore";
import { lessons, getLesson } from "./lessons";
import { stringName } from "./engine";
import { fusionHintHistogram } from "../observability/latencyHistogram";
import type { StatusKey } from "../theme/statusColors";
import { useToneStore } from "../tone/toneStore";

const ms = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} ms` : "-");

const STATUS_LABEL: Record<StatusKey, string> = {
  correct: "ok",
  warn: "check",
  error: "off",
  uncertain: "—",
};

export function LessonPanel() {
  const snap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const active = snap.lessonId !== null;
  const lesson = active ? getLesson(snap.lessonId!) : undefined;
  const step = lesson?.steps[snap.stepIndex];

  return (
    <section className="lesson-panel">
      <h3>Lesson (WP-4 fusion)</h3>
      <div className="wizard-controls">
        <select
          data-testid="lesson-select"
          defaultValue="open_chords_c_major"
          disabled={active}
          id="lesson-select"
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        {active ? (
          <button type="button" data-testid="lesson-stop" onClick={stopLesson}>
            Stop lesson
          </button>
        ) : (
          <button
            type="button"
            data-testid="lesson-start"
            onClick={() => {
              const sel = document.getElementById("lesson-select") as HTMLSelectElement | null;
              if (!sel) return;
              startLesson(sel.value);
              const lesson = getLesson(sel.value);
              if (lesson?.tone_preset)
                useToneStore.getState().applyPreset(lesson.tone_preset, { preserveMonitor: true });
            }}
          >
            Start lesson
          </button>
        )}
        {active && snap.stepCount > 1 && (
          <button
            type="button"
            data-testid="lesson-next-step"
            onClick={() => setStep((snap.stepIndex + 1) % snap.stepCount)}
          >
            Next step ({snap.stepIndex + 1}/{snap.stepCount})
          </button>
        )}
      </div>

      {active && step && (
        <>
          <div className="audio-row">
            <span className="audio-label">Target</span>
            <span className="audio-value" data-testid="lesson-target">
              {snap.targetChord}
            </span>
            <span className="audio-count">
              {Object.entries(step.accepted_fingerings[0])
                .filter(([, p]) => p)
                .map(([f, p]) => `${f}→${stringName(p!.string)} f${p!.fret}`)
                .join(" · ")}
            </span>
          </div>

          <div className="string-chips" data-testid="string-chips">
            {[6, 5, 4, 3, 2, 1].map((s) => {
              const st: StatusKey = snap.stringStatus?.[s] ?? "uncertain";
              return (
                <span key={s} className={`string-chip ${st}`} title={`${stringName(s)}: ${st}`}>
                  {stringName(s)} {STATUS_LABEL[st]}
                </span>
              );
            })}
          </div>

          <div className="audio-row">
            <span className="audio-label">Hint</span>
            <span className="audio-value hint-line" data-testid="hint-text">
              {snap.hint ? snap.hint.text : "—"}
            </span>
            <button
              type="button"
              data-testid="tip-wrong"
              disabled={!snap.hint}
              onClick={flagTipWrong}
              title="Report this tip as wrong (false-feedback metric)"
            >
              Tip was wrong
            </button>
          </div>
          <div className="audio-row">
            <span className="audio-label">Fusion</span>
            <span className="audio-count">
              diag {snap.counts.diagnoses} · hints {snap.counts.hints} · dropped{" "}
              {snap.counts.dropped} · last{" "}
              {snap.lastDiagnosis ? `${snap.lastDiagnosis.code} ${(snap.lastDiagnosis.conf * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
          <div className="audio-row">
            <span className="audio-label">Latency</span>
            <span className="audio-count" data-testid="fusion-latency">
              hint p50 {ms(fusionHintHistogram.p50)} · p95 {ms(fusionHintHistogram.p95)} (n{" "}
              {fusionHintHistogram.count}) · complaints {snap.counts.complaints}/{snap.counts.hints}
              {snap.counts.hints > 0 &&
                ` (${((snap.counts.complaints / snap.counts.hints) * 100).toFixed(0)}%)`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
