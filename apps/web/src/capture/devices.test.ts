import { describe, expect, it } from "vitest";
import { classifyAudioInput, pickPreferredAudioInput } from "./devices";

const dev = (label: string, deviceId = label): MediaDeviceInfo =>
  ({ deviceId, groupId: "", kind: "audioinput", label, toJSON: () => ({}) }) as MediaDeviceInfo;

describe("classifyAudioInput", () => {
  it("recognizes common interfaces", () => {
    for (const l of [
      "Scarlett 2i2 USB",
      "Analogue 1 + 2 (Focusrite USB Audio)",
      "IN 1-2 (BEHRINGER UMC202HD)",
      "iRig HD 2",
      "Line 6 HX Stomp",
      "Guitar Input (Hi-Z)",
      "Komplete Audio 2",
      "Volt 2",
    ])
      expect(classifyAudioInput(l), l).toBe("interface");
  });
  it("recognizes built-in / voice devices as mic", () => {
    for (const l of [
      "Microphone Array (Realtek(R) Audio)",
      "Built-in Microphone",
      "Headset (AirPods)",
      "Microphone (HD Pro Webcam C920)",
    ])
      expect(classifyAudioInput(l), l).toBe("mic");
  });
  it("returns unknown for empty or unrecognized labels", () => {
    expect(classifyAudioInput("")).toBe("unknown");
    expect(classifyAudioInput("USB Composite Device")).toBe("unknown");
  });
});

describe("pickPreferredAudioInput", () => {
  it("picks the first interface-classified device", () => {
    const mics = [dev("Microphone Array (Realtek(R) Audio)"), dev("Scarlett 2i2 USB"), dev("Volt 2")];
    expect(pickPreferredAudioInput(mics)?.label).toBe("Scarlett 2i2 USB");
  });
  it("returns null when no interface is present", () => {
    expect(pickPreferredAudioInput([dev("Built-in Microphone")])).toBeNull();
    expect(pickPreferredAudioInput([])).toBeNull();
  });
});
