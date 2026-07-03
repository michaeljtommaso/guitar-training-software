// Capture controller: opens camera+mic with the guarded constraints and wires
// the WP-1 topology — video element (rVFC), AudioContext@48k → AudioWorklet →
// SAB ring buffer → audio worker, and the vision worker (OffscreenCanvas +
// ImageBitmap frame pump + WebGPU/WASM capability probe).
import { buildConstraints, type DeviceSelection } from "./buildConstraints";
import { startVideoFrameLoop } from "./videoFrameLoop";
import { ringBufferByteLength, RING_CAPACITY } from "../perception/audio/ringBuffer";
import type {
  AudioWorkerStats,
  AudioEventsMsg,
  AudioStateMsg,
  NotesChunkMsg,
} from "../perception/audio/audioWorker";
import { setPerception, recordAudioEvents, recordNotes } from "../perception/perceptionStore";
import type { NotesEvent } from "../perception/audio/notes/NoteSource";
import captureProcessorUrl from "../perception/audio/capture-processor.ts?worker&url";

export interface CaptureHandles {
  stream: MediaStream;
  stop(): void;
}

export interface CaptureOptions extends DeviceSelection {
  /** Run Basic Pitch polyphonic notes in a worker (TF.js). Default true. */
  enableNotes?: boolean;
}

export async function startCapture(
  video: HTMLVideoElement,
  sel: CaptureOptions = {},
): Promise<CaptureHandles> {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "SharedArrayBuffer unavailable — the page must be cross-origin isolated (COOP/COEP headers).",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(sel));
  video.srcObject = stream;
  await video.play();

  // --- audio: AudioContext@48k → worklet → SAB ring → worker ---------------
  const audioContext = new AudioContext({ sampleRate: 48000 });
  await audioContext.resume();
  await audioContext.audioWorklet.addModule(captureProcessorUrl);

  // Latency clock bridging happens inside the ring buffer via per-frame
  // dual stamps (audio clock + Date.now()) — see ringBuffer.ts/audioWorker.ts.
  const sab = new SharedArrayBuffer(ringBufferByteLength(RING_CAPACITY));

  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, "capture-processor", {
    processorOptions: { sab },
  });
  source.connect(workletNode);
  workletNode.connect(audioContext.destination); // outputs silence; keeps the graph pulled

  const audioWorker = new Worker(new URL("../perception/audio/audioWorker.ts", import.meta.url), {
    type: "module",
  });
  audioWorker.postMessage({ type: "init", sab, sampleRate: audioContext.sampleRate });

  // Basic Pitch notes run off the hot path in their own worker (TF.js is
  // heavy). Optional and fully contained — a notes failure never disturbs the
  // onset/chord/tuner loop.
  const enableNotes = sel.enableNotes ?? true;
  let notesWorker: Worker | null = null;
  if (enableNotes) {
    notesWorker = new Worker(new URL("../perception/audio/notes/notesWorker.ts", import.meta.url), {
      type: "module",
    });
    notesWorker.postMessage({ type: "init", modelUrl: "/models/basic-pitch/model.json" });
    notesWorker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: "notes"; events: NotesEvent[] } | { type: string };
      if (msg.type === "notes") for (const ev of (msg as { events: NotesEvent[] }).events) recordNotes(ev);
    };
  }

  audioWorker.onmessage = (e: MessageEvent) => {
    const msg = e.data as AudioWorkerStats | AudioEventsMsg | AudioStateMsg | NotesChunkMsg;
    if (msg.type === "audioStats") {
      setPerception({
        audio: {
          framesRead: msg.framesRead,
          samplesConsumed: msg.samplesConsumed,
          dropped: msg.dropped,
          latencyMs: msg.latencyMs,
        },
      });
    } else if (msg.type === "audioEvents") {
      recordAudioEvents(msg.events);
    } else if (msg.type === "audioState") {
      setPerception({ audioAnalysis: msg.state });
    } else if (msg.type === "notesChunk") {
      notesWorker?.postMessage(
        { type: "chunk", samples: msg.samples, sampleRate: msg.sampleRate, startTimeMs: msg.startTimeMs },
        [msg.samples.buffer],
      );
    }
  };

  // --- vision worker topology ----------------------------------------------
  const visionWorker = new Worker(
    new URL("../perception/vision/visionWorker.ts", import.meta.url),
    { type: "module" },
  );
  const offscreen = new OffscreenCanvas(1280, 720);
  visionWorker.postMessage({ type: "init", canvas: offscreen }, [offscreen]);
  visionWorker.onmessage = (e: MessageEvent) => {
    const msg = e.data as
      | { type: "capability"; backend: "webgpu" | "wasm" }
      | { type: "visionStats"; framesReceived: number };
    if (msg.type === "capability") setPerception({ backend: msg.backend });
    else if (msg.type === "visionStats") setPerception({ visionFrames: msg.framesReceived });
  };

  // Frame pump: rVFC-aligned ImageBitmaps (topology proof; ROI path is WP-3).
  let pumpBusy = false;
  const pumpLoop = startVideoFrameLoop(video, () => {
    if (pumpBusy || video.readyState < 2) return;
    pumpBusy = true;
    createImageBitmap(video)
      .then((bitmap) => visionWorker.postMessage({ type: "frame", bitmap }, [bitmap]))
      .catch(() => undefined) // frame not decodable yet — skip
      .finally(() => {
        pumpBusy = false;
      });
  });

  return {
    stream,
    stop() {
      pumpLoop.stop();
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      workletNode.disconnect();
      void audioContext.close();
      audioWorker.terminate();
      notesWorker?.terminate();
      visionWorker.terminate();
      video.srcObject = null;
    },
  };
}
