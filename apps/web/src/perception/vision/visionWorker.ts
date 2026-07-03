// Vision worker topology (WP-1): owns an OffscreenCanvas transferred from the
// main thread, receives rVFC-aligned ImageBitmap frames via postMessage, and
// reports which inference backend the environment supports. No landmark
// inference yet — that is WP-3.
import { selectBackend } from "../capabilities";

type InMsg =
  | { type: "init"; canvas: OffscreenCanvas }
  | { type: "frame"; bitmap: ImageBitmap };

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let framesReceived = 0;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as InMsg;
  if (msg.type === "init") {
    ctx = msg.canvas.getContext("2d");
    let adapter: unknown = null;
    try {
      const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      adapter = gpu ? await gpu.requestAdapter() : null;
    } catch {
      adapter = null; // probe failure = no usable WebGPU
    }
    postMessage({ type: "capability", backend: selectBackend(adapter) });
  } else if (msg.type === "frame") {
    framesReceived++;
    ctx?.drawImage(msg.bitmap, 0, 0);
    msg.bitmap.close();
    if (framesReceived % 60 === 0) {
      postMessage({ type: "visionStats", framesReceived });
    }
  }
};
