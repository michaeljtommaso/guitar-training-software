// Wizard step 2 — Signal check (spec §7). The EXISTING InputMeter (with its
// own `-N dB · floor` mono readout) and OpenStringCheck (chips + n/6) mount
// as-is — token-restyled via wizard.css descendant selectors only, no changes
// to either component file. Measure round-trip + latencyAdvice are lifted
// verbatim from SetupWizard.tsx's measureLatency flow (owned by Wizard.tsx;
// this component is purely presentational).
import { InputMeter } from "../capture/InputMeter";
import { OpenStringCheck } from "../capture/OpenStringCheck";
import type { LatencyAdvice } from "../capture/latencyAdvice";

export interface WizardStep2Props {
  probing: boolean;
  latencyMsg: string;
  latencyAdvice: LatencyAdvice | null;
  onMeasure(): void;
  onBack(): void;
  onContinue(): void;
}

export function WizardStep2({ probing, latencyMsg, latencyAdvice, onMeasure, onBack, onContinue }: WizardStep2Props) {
  return (
    <>
      <h2>Signal check</h2>
      <p className="wizard-copy">
        Play each open string once, low E to high e. A chip lights when the string reads clean.
      </p>

      <div className="wizard-signal-block">
        <InputMeter />
        <OpenStringCheck />

        <div className="wizard-actions">
          <button
            type="button"
            className="wizard-btn-ghost"
            data-testid="measure-latency"
            disabled={probing}
            onClick={onMeasure}
          >
            {probing ? "Measuring…" : "Measure round-trip"}
          </button>
          {latencyMsg && <span className="wizard-copy-muted">{latencyMsg}</span>}
          {latencyAdvice && (
            <span
              className={`wizard-latency-advice wizard-latency-advice-${latencyAdvice.tier}`}
              data-testid="latency-advice"
            >
              {latencyAdvice.message}
            </span>
          )}
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="wizard-btn-ghost" data-testid="wizard-step2-back" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="wizard-btn-primary" data-testid="wizard-step2-continue" onClick={onContinue}>
          Continue →
        </button>
      </div>
    </>
  );
}
