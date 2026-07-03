// Pure getUserMedia constraint builder.
//
// HARD GUARDRAIL (unit-test-enforced): echoCancellation, noiseSuppression and
// autoGainControl MUST be exactly false. The browser's voice-tuned DSP
// destroys instrument analysis (ADR-004) — if you change these, the guardrail
// test in buildConstraints.test.ts fails on purpose.
export interface DeviceSelection {
  videoDeviceId?: string;
  audioDeviceId?: string;
}

export function buildConstraints(sel: DeviceSelection = {}) {
  return {
    video: {
      ...(sel.videoDeviceId ? { deviceId: { exact: sel.videoDeviceId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: {
      ...(sel.audioDeviceId ? { deviceId: { exact: sel.audioDeviceId } } : {}),
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  } satisfies MediaStreamConstraints;
}
