// Coach panel (WP-5). Shows the recent-diagnoses summary, lets the student ask
// a question, and exposes the Local-only toggle (DEFAULT ON). In local-only
// mode it answers from the on-device template coach with ZERO network calls;
// with the toggle off it streams from /ws/coach and degrades to templates if
// the backend is unavailable.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DiagnosisCode } from "../fusion";
import { getFusionSnapshot, subscribeFusion } from "../fusion/fusionStore";
import { coachAnswer } from "./coachClient";
import { useCoachStore } from "./coachStore";
import type { CoachDiagnosis, CoachReply } from "./templateCoach";
import "./coach.css";

const CODE_LABELS: Record<DiagnosisCode, string> = {
  wrong_fret: "wrong fret",
  wrong_string: "wrong string",
  muted_string: "muted string",
  behind_fret: "finger behind the fret",
  missing_note: "missing note",
  late_strum: "late strum",
  ok: "sounding good",
};

function newSessionId(): string {
  const c = globalThis.crypto;
  return c && "randomUUID" in c ? c.randomUUID() : `sess-${Date.now()}`;
}

export function CoachPanel() {
  const snap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const localOnly = useCoachStore((s) => s.localOnly);
  const toggleLocalOnly = useCoachStore((s) => s.toggleLocalOnly);
  const hydrate = useCoachStore((s) => s.hydrate);

  const sessionId = useRef(newSessionId()).current;
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState("");
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const last = snap.lastDiagnosis;
  const summary = last
    ? `Last: ${CODE_LABELS[last.code]} (${Math.round(last.conf * 100)}% conf) on ${snap.targetChord ?? "—"}`
    : "Play a chord to get feedback, then ask the coach about it.";

  async function ask() {
    setBusy(true);
    setStreaming("");
    setReply(null);
    const diagnoses: CoachDiagnosis[] = last
      ? [{ code: last.code, conf: last.conf, severity: last.severity }]
      : [];
    const result = await coachAnswer(
      {
        sessionId,
        targetChord: snap.targetChord ?? undefined,
        lessonId: snap.lessonId ?? undefined,
        diagnoses,
        question,
      },
      { localOnly, onDelta: (t) => setStreaming((s) => s + t) },
    );
    setReply(result);
    setBusy(false);
  }

  const sourceLabel = reply
    ? reply.source === "model"
      ? `Model reply (${reply.provider})`
      : reply.provider === "local"
        ? "On-device coach"
        : "On-device coach (backend unavailable)"
    : "";

  return (
    <section className="coach-panel" aria-label="Coach">
      <div className="coach-header">
        <span className="coach-eyebrow">Coach</span>
        <label className="coach-toggle">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={toggleLocalOnly}
            data-testid="coach-local-only"
          />
          Local-only mode
        </label>
      </div>

      <p className="coach-summary" data-testid="coach-summary">
        {summary}
      </p>

      <div className="coach-ask">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the coach, e.g. why does my C sound muffled?"
          aria-label="Question for the coach"
        />
        <button type="button" onClick={ask} disabled={busy} data-testid="coach-ask">
          {busy ? "Thinking…" : "Ask coach"}
        </button>
      </div>

      {!localOnly && streaming && !reply && (
        <div className="coach-reply" data-testid="coach-streaming">
          {streaming}
        </div>
      )}

      {reply && (
        <div className="coach-reply" data-testid="coach-reply">
          {reply.hedged ? `Likely: ${reply.message}` : reply.message}
          <div className="coach-source" data-testid="coach-source">
            {sourceLabel}
          </div>
        </div>
      )}
    </section>
  );
}
