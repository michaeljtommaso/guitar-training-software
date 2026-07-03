// Picks which finger the next QuadOverlay click assigns, and lists/deletes
// the assignments recorded for the current frame.
import { FINGERS, type Finger } from "../shared/diagnosis";
import type { FingerAssignment } from "../schemas/taxonomy";

export interface FingerAssignPanelProps {
  frame: number;
  selectedFinger: Finger;
  onSelectFinger(f: Finger): void;
  assignments: FingerAssignment[];
  onDelete(indexInFullList: number): void;
}

export function FingerAssignPanel({ frame, selectedFinger, onSelectFinger, assignments, onDelete }: FingerAssignPanelProps) {
  // Indices into the FULL assignment list (across all frames) so delete stays correct.
  const forFrame = assignments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.frame === frame);

  return (
    <section className="panel">
      <h2>Fingertip assignment</h2>
      <div className="finger-picker" role="radiogroup" aria-label="Finger for next click">
        {FINGERS.map((f) => (
          <button
            key={f}
            type="button"
            className={f === selectedFinger ? "finger-btn selected" : "finger-btn"}
            aria-pressed={f === selectedFinger}
            onClick={() => onSelectFinger(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <p className="panel-hint">Click inside the grid to assign the selected finger on frame {frame}.</p>
      <ul className="assign-list">
        {forFrame.map(({ a, i }) => (
          <li key={i}>
            <span>
              {a.finger} → string {a.string}, fret {a.fret}
            </span>
            <button type="button" onClick={() => onDelete(i)} aria-label={`Delete ${a.finger} assignment`}>
              ×
            </button>
          </li>
        ))}
        {forFrame.length === 0 && <li className="empty">No assignments on this frame.</li>}
      </ul>
    </section>
  );
}
