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
