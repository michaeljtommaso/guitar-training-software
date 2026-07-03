// Per time-range mistake-taxonomy tagging, using EXACTLY the Diagnosis codes
// (shared/diagnosis.ts, copied from apps/web/src/fusion/diagnosis.ts) plus a
// free-text note.
import { useState } from "react";
import { DIAGNOSIS_CODES, type DiagnosisCode } from "../shared/diagnosis";
import type { TagRange } from "../schemas/taxonomy";

export interface MistakeTagPanelProps {
  currentTime: number;
  tags: TagRange[];
  onAdd(tag: TagRange): void;
  onDelete(index: number): void;
}

export function MistakeTagPanel({ currentTime, tags, onAdd, onDelete }: MistakeTagPanelProps) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [code, setCode] = useState<DiagnosisCode>("wrong_fret");
  const [note, setNote] = useState("");

  return (
    <section className="panel">
      <h2>Mistake tags</h2>
      <div className="tag-form">
        <label>
          Start
          <input type="number" step="0.01" value={start} onChange={(e) => setStart(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setStart(currentTime)}>
          Use current time
        </button>
        <label>
          End
          <input type="number" step="0.01" value={end} onChange={(e) => setEnd(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setEnd(currentTime)}>
          Use current time
        </button>
        <label>
          Code
          <select value={code} onChange={(e) => setCode(e.target.value as DiagnosisCode)}>
            {DIAGNOSIS_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="free text (optional)" />
        </label>
        <button
          type="button"
          onClick={() => {
            onAdd({ start, end, code, note: note || undefined });
            setNote("");
          }}
          disabled={end < start}
        >
          Add tag
        </button>
      </div>
      <ul className="tag-list">
        {tags.map((t, i) => (
          <li key={i}>
            <span>
              [{t.start.toFixed(2)}–{t.end.toFixed(2)}s] {t.code}
              {t.note ? ` — ${t.note}` : ""}
            </span>
            <button type="button" onClick={() => onDelete(i)} aria-label={`Delete tag ${i}`}>
              ×
            </button>
          </li>
        ))}
        {tags.length === 0 && <li className="empty">No tags yet.</li>}
      </ul>
    </section>
  );
}
