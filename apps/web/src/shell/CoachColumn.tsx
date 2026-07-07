// Coach column (spec v2-ui §5): the persistent ~320px right-hand column of
// PracticeScreen.
//
// Practice mode hosts the coach chat — COACH header, local-only badge-toggle,
// last-diagnosis summary, latest answer + source label, question box + Ask —
// driven by the SAME useCoach() hook the legacy CoachPanel uses (behavior
// byte-identical, restyled to v2 tokens).
//
// Explore mode swaps to the EXISTING explore controls (kind/root/suffix
// pickers, feedback tier, voicing pager, no-voicings message) via
// `ExploreControls` (explore/ExploreControls.tsx) — every existing
// explore-* testid keeps working, and its store/logic are untouched. The
// strip itself is NOT mounted here; per spec §5/§8 it renders in the ZoomPane
// slot, so it stays out of this ~320px column.
//
// Practice mode ALSO hosts a small "coach | log issue" sub-tab switch above
// the ask box (field-testing debug logger, docs/superpowers/sdd/debuglog-brief.md).
// `coach` is the default and its rendering/behavior is byte-identical to
// before this switch existed — `log issue` swaps the ask box out for a note
// + `appendEntry()` form (debuglog/debugLog.ts), never touching useCoach().
import { useState } from "react";
import { useExploreStore } from "../explore/exploreStore";
import { ExploreControls } from "../explore/ExploreControls";
import { useCoach } from "../coach/useCoach";
import { appendEntry, clearEntries, downloadMarkdown, getEntries } from "../debuglog/debugLog";
import "./CoachColumn.css";

type CoachSubTab = "coach" | "log";

function LogIssueForm() {
  const [note, setNote] = useState("");
  const [count, setCount] = useState(() => getEntries().length);
  const [lastLogged, setLastLogged] = useState<number | null>(null);

  const logIt = () => {
    if (!note.trim()) return;
    appendEntry(note);
    const total = getEntries().length;
    setNote("");
    setCount(total);
    setLastLogged(total);
  };

  const clear = () => {
    if (!window.confirm("Clear all logged debug entries? This can't be undone.")) return;
    clearEntries();
    setCount(0);
    setLastLogged(null);
  };

  return (
    <div className="coach-column-ask coach-column-log">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What went wrong? Describe what you did and what you expected…"
        aria-label="Describe the issue"
      />
      <button type="button" onClick={logIt} disabled={!note.trim()} data-testid="debug-log-submit">
        Log it
      </button>
      {lastLogged !== null && (
        <p className="coach-column-log-confirm" data-testid="debug-log-count">
          logged ✓ ({lastLogged} total)
        </p>
      )}
      {count > 0 && (
        <div className="coach-column-log-actions">
          <button
            type="button"
            className="coach-column-log-quiet"
            onClick={downloadMarkdown}
            data-testid="debug-log-download"
          >
            download log ({count})
          </button>
          <button type="button" className="coach-column-log-quiet" onClick={clear} data-testid="debug-log-clear">
            clear
          </button>
        </div>
      )}
    </div>
  );
}

function CoachTab() {
  const { localOnly, toggleLocalOnly, summary, question, setQuestion, streaming, reply, busy, ask, sourceLabel } =
    useCoach();
  const [subTab, setSubTab] = useState<CoachSubTab>("coach");

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

      <div className="coach-column-subtabs" role="tablist" aria-label="Coach column mode">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "coach"}
          className={subTab === "coach" ? "active" : ""}
          onClick={() => setSubTab("coach")}
          data-testid="coach-tab-coach"
        >
          coach
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "log"}
          className={subTab === "log" ? "active" : ""}
          onClick={() => setSubTab("log")}
          data-testid="coach-tab-log"
        >
          log issue
        </button>
      </div>

      {subTab === "log" ? (
        <LogIssueForm />
      ) : (
        <>
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
