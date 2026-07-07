// Coach panel (WP-5). Shows the recent-diagnoses summary, lets the student ask
// a question, and exposes the Local-only toggle (DEFAULT ON). In local-only
// mode it answers from the on-device template coach with ZERO network calls;
// with the toggle off it streams from /ws/coach and degrades to templates if
// the backend is unavailable.
//
// v2-ui (spec §5): the state/behavior lives in useCoach() so the restyled
// CoachColumn can reuse it byte-identically — this component is now purely
// the legacy JSX shell over that hook.
import { useCoach } from "./useCoach";
import "./coach.css";

export function CoachPanel() {
  const { localOnly, toggleLocalOnly, summary, question, setQuestion, streaming, reply, busy, ask, sourceLabel } =
    useCoach();

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
