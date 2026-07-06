// Device enumeration for the setup wizard. Labels are only populated after a
// successful getUserMedia, so callers re-enumerate once capture has started.
export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export async function listCaptureDevices(): Promise<DeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === "videoinput"),
    mics: all.filter((d) => d.kind === "audioinput"),
  };
}

// ADR-013: label heuristics are a HINT, not truth — permission-gated labels
// can be empty and vendors are inconsistent. The wizard pairs this with the
// live level/open-string check and always lets the user override.
export type AudioInputKind = "interface" | "mic" | "unknown";

const INTERFACE_RE =
  /scarlett|focusrite|clarett|vocaster|behringer|u-?phoria|umc\d|audient|evo ?\d|motu|\brme\b|babyface|fireface|presonus|audiobox|steinberg|\bur\d|komplete audio|apollo|volt ?\d|irig|line ?6|helix|hx stomp|pod go|katana|m-audio|air ?192|ssl ?2|minifuse|tascam|us-\d|zoom [gu]\d|hi-?z|instrument|guitar|audio interface|quad cortex|axe-?fx/i;

const MIC_RE =
  /built-?in|internal|integrated|realtek|conexant|microphone array|webcam|camera|bluetooth|hands-?free|headset|airpods/i;

export function classifyAudioInput(label: string): AudioInputKind {
  if (!label) return "unknown";
  if (INTERFACE_RE.test(label)) return "interface";
  if (MIC_RE.test(label)) return "mic";
  return "unknown";
}

export function pickPreferredAudioInput(mics: MediaDeviceInfo[]): MediaDeviceInfo | null {
  return mics.find((m) => classifyAudioInput(m.label) === "interface") ?? null;
}
