import { configDefaults, defineConfig } from "vitest/config";
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
  // worker.format stays at Vite's default 'iife' (classic). The vision worker is
  // imported via `?worker`, so it is bundled as a self-contained CLASSIC worker in
  // both dev and build — which is what MediaPipe's importScripts-based wasm loader
  // requires (a module worker can't importScripts the Emscripten glue). See
  // controller.ts and docs/debug/phase0-findings.md (BUG-002).
  build: {
    rollupOptions: {
      output: {
        // Keep Sentry in its own lazily-loaded chunk: it is imported only when a
        // DSN is configured (WP-7, §15), so it must stay OFF the initial payload.
        // The bundle-size gate treats `sentry` chunks as deferred (like opencv).
        manualChunks: (id) => (id.includes("@sentry") ? "sentry" : undefined),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright specs are not vitest tests.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
