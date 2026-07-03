import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// SharedArrayBuffer/threads (WASM/WebGPU perception workers, later WPs) require
// cross-origin isolation, so both dev and preview serve COOP/COEP headers.
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
