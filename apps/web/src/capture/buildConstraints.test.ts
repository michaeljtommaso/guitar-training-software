import { describe, expect, it } from "vitest";
import { buildConstraints } from "./buildConstraints";

describe("buildConstraints", () => {
  // HARD GUARDRAIL (run contract): the browser's voice DSP must be off for
  // instrument analysis. These must be EXACTLY false — not absent, not truthy.
  it("guardrail: emits echoCancellation/noiseSuppression/autoGainControl exactly false", () => {
    const c = buildConstraints();
    expect(c.audio.echoCancellation).toBe(false);
    expect(c.audio.noiseSuppression).toBe(false);
    expect(c.audio.autoGainControl).toBe(false);
  });

  it("requests 48 kHz mono audio", () => {
    const c = buildConstraints();
    expect(c.audio.sampleRate).toEqual({ ideal: 48000 });
    expect(c.audio.channelCount).toEqual({ ideal: 1 });
  });

  it("requests 720p30 video", () => {
    const c = buildConstraints();
    expect(c.video.width).toEqual({ ideal: 1280 });
    expect(c.video.height).toEqual({ ideal: 720 });
    expect(c.video.frameRate).toEqual({ ideal: 30 });
  });

  it("pins exact device ids when selected, omits them otherwise", () => {
    const picked = buildConstraints({ videoDeviceId: "cam-1", audioDeviceId: "mic-1" });
    expect(picked.video.deviceId).toEqual({ exact: "cam-1" });
    expect(picked.audio.deviceId).toEqual({ exact: "mic-1" });

    const defaults = buildConstraints();
    expect(defaults.video.deviceId).toBeUndefined();
    expect(defaults.audio.deviceId).toBeUndefined();
  });
});
