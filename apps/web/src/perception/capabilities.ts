// Perception inference backend selection. The async probe
// (navigator.gpu?.requestAdapter()) runs in the vision worker and posts its
// result back as data; this pure function is the testable decision.
export type PerceptionBackend = "webgpu" | "wasm";

export function selectBackend(adapter: unknown): PerceptionBackend {
  return adapter != null ? "webgpu" : "wasm";
}
