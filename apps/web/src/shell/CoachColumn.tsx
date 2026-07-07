// Coach column (spec v2-ui §5): the persistent ~320px right-hand column of
// PracticeScreen.
//
// Practice mode hosts the coach chat — COACH header, local-only badge-toggle,
// last-diagnosis summary, latest answer + source label, question box + Ask —
// driven by the SAME useCoach() hook the legacy CoachPanel uses (behavior
// byte-identical, restyled to v2 tokens).
//
// Explore mode swaps to the EXISTING ExplorePanel controls (kind/root/suffix
// pickers, feedback tier, voicing pager, no-voicings message) via the
// `ExploreControls` split (see explore/ExplorePanel.tsx) — every existing
// explore-* testid keeps working, and its store/logic are untouched. The
// strip itself is NOT mounted here; per spec §5/§8 it renders in the ZoomPane
// slot (a parallel task), so it stays out of this ~320px column.
import { useExploreStore } from "../explore/exploreStore";
import { ExploreControls } from "../explore/ExplorePanel";
import { useCoach } from "../coach/useCoach";
import "./CoachColumn.css";

function CoachTab() {
  const { localOnly, toggleLocalOnly, summary, question, setQuestion, streaming, reply, busy, ask, sourceLabel } =
    useCoach();

  return (
    <>
      <div className="coach-column-header">
        <span className="coach-column-eyebrow">Coach</span>
        <label className="coach-column-toggle">
          <input
            type="checkbox"
            checked={localOnly}
            onChange={toggleLocalOnly}
            data-testid="coach-local-only"
          />
          local-only
        </label>
      </div>

      <p className="coach-column-summary" data-testid="coach-summary">
        {summary}
      </p>

      <div className="coach-column-ask">
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
        <div className="coach-column-reply" data-testid="coach-streaming">
          {streaming}
        </div>
      )}

      {reply && (
        <div className="coach-column-reply" data-testid="coach-reply">
          {reply.hedged ? `Likely: ${reply.message}` : reply.message}
          <div className="coach-column-source" data-testid="coach-source">
            {sourceLabel}
          </div>
        </div>
      )}
    </>
  );
}

function ExploreTab() {
  return (
    <>
      <div className="coach-column-header">
        <span className="coach-column-eyebrow">Explore</span>
      </div>
      <div className="coach-column-explore">
        <ExploreControls />
      </div>
    </>
  );
}

export function CoachColumn() {
  const mode = useExploreStore((s) => s.mode);

  return (
    <aside className="coach-column" data-testid="coach-column" aria-label="Coach">
      {mode === "explore" ? <ExploreTab /> : <CoachTab />}
    </aside>
  );
}
