// Wizard step 3 — You're set (spec §7). Summary lines are composed ONLY from
// real state by the caller (wizardLogic.composeWizardSummary) — this
// component is a pure renderer of whatever it's handed.
import type { WizardSummary } from "./wizardLogic";

export interface WizardStep3Props {
  summary: WizardSummary;
  onBack(): void;
  onFinish(): void;
}

export function WizardStep3({ summary, onBack, onFinish }: WizardStep3Props) {
  return (
    <>
      <h2>You&rsquo;re set</h2>

      <ul className="wizard-summary" data-testid="wizard-summary">
        <li data-testid="wizard-summary-camera">✓ {summary.cameraLine}</li>
        <li data-testid="wizard-summary-zoom">✓ {summary.zoomLine}</li>
        <li data-testid="wizard-summary-input">✓ {summary.inputLine}</li>
        <li data-testid="wizard-summary-open-strings">✓ {summary.openStringsLine}</li>
      </ul>

      <p className="wizard-copy-muted">
        You won&rsquo;t see this again — it&rsquo;s all saved. Re-run it anytime from the footer of the console.
      </p>

      <div className="wizard-nav">
        <button type="button" className="wizard-btn-ghost" data-testid="wizard-step3-back" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="wizard-btn-primary"
          data-testid="wizard-start-practicing"
          onClick={onFinish}
        >
          Start practicing
        </button>
      </div>
    </>
  );
}
