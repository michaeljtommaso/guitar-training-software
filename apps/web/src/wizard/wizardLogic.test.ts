import { describe, expect, it } from "vitest";
import { composeWizardSummary, isDirectInput, type WizardSummaryInput } from "./wizardLogic";

const BASE: WizardSummaryInput = {
  cameraLabel: "FaceTime HD Camera",
  calibrated: false,
  inputLabel: "Scarlett 2i2 USB",
  inputKind: "interface",
  inputLevelDb: -18,
  openStringsSeen: 6,
  latencyMs: 34,
};

describe("isDirectInput (badge logic)", () => {
  it("is true only for the 'interface' classification", () => {
    expect(isDirectInput("interface")).toBe(true);
    expect(isDirectInput("mic")).toBe(false);
    expect(isDirectInput("unknown")).toBe(false);
  });
});

describe("composeWizardSummary (spec §7 step-3 summary, real state only)", () => {
  it("composes all four lines from real values", () => {
    const summary = composeWizardSummary(BASE);
    expect(summary.cameraLine).toBe("FaceTime HD Camera — full scene");
    expect(summary.zoomLine).toBe("fretboard zoom crop — uncalibrated");
    expect(summary.inputLine).toBe("Scarlett 2i2 USB · direct input · -18 dB");
    expect(summary.openStringsLine).toBe("open strings 6/6 · ~34 ms round trip");
  });

  it("marks the zoom line calibrated when a homography is held", () => {
    const summary = composeWizardSummary({ ...BASE, calibrated: true });
    expect(summary.zoomLine).toBe("fretboard zoom crop — calibrated");
  });

  it("falls back to 'Default camera' / 'Default microphone' for empty labels", () => {
    const summary = composeWizardSummary({ ...BASE, cameraLabel: "", inputLabel: "" });
    expect(summary.cameraLine).toBe("Default camera — full scene");
    expect(summary.inputLine).toBe("Default microphone · direct input · -18 dB");
  });

  it("renders 'not measured' rather than a fake level when there's no audio health reading yet", () => {
    const summary = composeWizardSummary({ ...BASE, inputLevelDb: null });
    expect(summary.inputLine).toBe("Scarlett 2i2 USB · direct input · not measured");
  });

  it("renders 'not measured' rather than a fake round trip when latency was never probed", () => {
    const summary = composeWizardSummary({ ...BASE, latencyMs: null });
    expect(summary.openStringsLine).toBe("open strings 6/6 · not measured");
  });

  it("labels mic and unknown input kinds distinctly", () => {
    expect(composeWizardSummary({ ...BASE, inputKind: "mic" }).inputLine).toContain("· mic ·");
    expect(composeWizardSummary({ ...BASE, inputKind: "unknown" }).inputLine).toContain("· input ·");
  });
});
