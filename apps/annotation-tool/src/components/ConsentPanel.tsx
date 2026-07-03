// Consent + deletion are first-class (WP-6 honesty rule: biometric hand
// imagery and home audio are sensitive). Every annotation file carries
// {consent: {given, scope, date}}; "Delete clip data" wipes the working set
// for this clip and produces a downloadable deletion receipt.
import type { Consent } from "../schemas/taxonomy";

export interface ConsentPanelProps {
  consent: Consent;
  onChange(c: Consent): void;
  onDeleteClip(): void;
}

export function ConsentPanel({ consent, onChange, onDeleteClip }: ConsentPanelProps) {
  return (
    <section className="panel">
      <h2>Consent</h2>
      <label>
        <input
          type="checkbox"
          checked={consent.given}
          onChange={(e) => onChange({ ...consent, given: e.target.checked })}
        />
        Subject gave consent to record and use this clip
      </label>
      <label>
        Scope
        <input
          type="text"
          value={consent.scope}
          placeholder="e.g. internal-training-only"
          onChange={(e) => onChange({ ...consent, scope: e.target.value })}
        />
      </label>
      <label>
        Date
        <input type="date" value={consent.date} onChange={(e) => onChange({ ...consent, date: e.target.value })} />
      </label>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm("Delete this clip's annotation data from the working set? This cannot be undone here.")) {
            onDeleteClip();
          }
        }}
      >
        Delete clip data
      </button>
    </section>
  );
}
