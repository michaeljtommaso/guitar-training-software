import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { composeTelemetryLine, type TelemetryInputs } from "./TelemetryFooter";
import type { FusionSnapshot } from "../fusion/fusionStore";
import type { PerceptionSnapshot } from "../perception/perceptionStore";

// ── pure composition (spec §10: "TelemetryFooter composition from a fixture
// snapshot") — every field maps to a real store value; no fake data. ────────
describe("composeTelemetryLine (pure)", () => {
  const fixture: TelemetryInputs = {
    backend: "webgpu",
    frameDriver: "rvfc",
    audio: { framesRead: 18972, dropped: 0, latencyMs: 11.3, health: { rmsDb: -14, noiseFloorDb: -62 } },
    visionFrames: 3300,
    glassP50: 10.9,
    glassP95: 14.0,
    diagnoses: 45,
    hints: 12,
  };

  it("matches the prototype's field order and formatting (visual reference, spec §5)", () => {
    expect(composeTelemetryLine(fixture)).toBe(
      "webgpu · rVFC · glass→worker 11.3 ms (p50 10.9 / p95 14.0) · vision 3300 fr · ring 18972 rd · " +
        "drop 0 · diag 45 · hints 12 · in -14 dB / floor -62",
    );
  });

  it("omits backend/frameDriver/glass/health when their source is genuinely absent (no fake data)", () => {
    const line = composeTelemetryLine({
      backend: null,
      frameDriver: null,
      audio: null,
      visionFrames: 0,
      glassP50: NaN,
      glassP95: NaN,
      diagnoses: 0,
      hints: 0,
    });
    expect(line).toBe("vision 0 fr · diag 0 · hints 0");
  });

  it("shows tone latency only when a caller explicitly supplies it (optional prop, no store source yet)", () => {
    const withTone = composeTelemetryLine({ ...fixture, toneLatencyMs: 5.8, tonePresetLabel: "AMP" });
    expect(withTone).toContain("tone AMP 5.8 ms");
    const withoutTone = composeTelemetryLine(fixture);
    expect(withoutTone).not.toContain("tone");
  });

  it("renders the glass→worker histogram only once BOTH p50 and p95 are real numbers", () => {
    const partial = composeTelemetryLine({ ...fixture, glassP95: NaN });
    expect(partial).toContain("glass→worker 11.3 ms");
    expect(partial).not.toContain("p50");
  });
});

// ── component wiring ─────────────────────────────────────────────────────────
let perceptionSnap: PerceptionSnapshot;
let fusionSnap: FusionSnapshot;
vi.mock("../perception/perceptionStore", () => ({
  subscribe: () => () => {},
  getSnapshot: () => perceptionSnap,
}));
vi.mock("../fusion/fusionStore", () => ({
  subscribeFusion: () => () => {},
  getFusionSnapshot: () => fusionSnap,
}));

import { TelemetryFooter } from "./TelemetryFooter";

describe("TelemetryFooter (component)", () => {
  beforeEach(() => {
    perceptionSnap = {
      audio: null,
      backend: null,
      frameDriver: null,
      visionFrames: 0,
      audioAnalysis: null,
      notes: null,
      lastOnsetT: NaN,
      eventCounts: { onset: 0, chord: 0, notes: 0, tuning: 0 },
    };
    fusionSnap = {
      lessonId: null,
      lessonTitle: null,
      stepIndex: 0,
      stepCount: 0,
      targetChord: null,
      hint: null,
      lastDiagnosis: null,
      stringStatus: null,
      counts: { diagnoses: 0, hints: 0, dropped: 0, evaluations: 0, complaints: 0 },
      hintLatencyMs: [],
      evalLatencyMs: [],
    };
    localStorage.clear();
  });

  it("renders the composed line inside the telemetry-footer testid", () => {
    render(<TelemetryFooter consoleOpen={false} onToggleConsole={vi.fn()} />);
    expect(screen.getByTestId("telemetry-footer")).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-footer-line")).toHaveTextContent("vision 0 fr");
  });

  it("console button reflects open state and calls onToggleConsole", () => {
    const onToggleConsole = vi.fn();
    const { rerender } = render(<TelemetryFooter consoleOpen={false} onToggleConsole={onToggleConsole} />);
    expect(screen.getByTestId("telemetry-footer-console")).toHaveTextContent("console ▴");
    fireEvent.click(screen.getByTestId("telemetry-footer-console"));
    expect(onToggleConsole).toHaveBeenCalledTimes(1);

    rerender(<TelemetryFooter consoleOpen={true} onToggleConsole={onToggleConsole} />);
    expect(screen.getByTestId("telemetry-footer-console")).toHaveTextContent("close console ▴");
  });

  it("setup-wizard link clears gt-setup-done and calls onRerunWizard", () => {
    localStorage.setItem("gt-setup-done", "true");
    const onRerunWizard = vi.fn();
    render(<TelemetryFooter consoleOpen={false} onToggleConsole={vi.fn()} onRerunWizard={onRerunWizard} />);
    fireEvent.click(screen.getByTestId("telemetry-footer-wizard"));
    expect(localStorage.getItem("gt-setup-done")).toBeNull();
    expect(onRerunWizard).toHaveBeenCalledTimes(1);
  });
});
