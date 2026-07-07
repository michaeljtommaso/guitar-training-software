import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = dirname(fileURLToPath(import.meta.url));

// SharedArrayBuffer/threads (WASM/WebGPU perception workers, later WPs) require
// cross-origin isolation, so both dev and preview serve COOP/COEP headers.
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// BUG-002 (dev-only): MediaPipe's HandLandmarker loads its Emscripten wasm glue
// (`vision_wasm_internal*.js`) with a runtime dynamic `import()`. Those files
// live in `public/models/mediapipe/wasm/` and are Emscripten scripts, NOT ES
// modules. In `vite dev` the request arrives as `…/vision_wasm_internal.js?import`
// and Vite's transform middleware refuses it ("This file is in /public … should
// not be imported from source code"), so the vision worker never initializes.
// `vite preview` / the production build serve /public raw and work fine.
//
// This plugin runs ONLY on the dev server (`apply: "serve"`) and installs a
// middleware that — because middleware registered in `configureServer` runs
// BEFORE Vite's internal transform middleware — intercepts requests for the
// MediaPipe wasm-loader JS and streams the raw file with a script MIME type,
// bypassing the module graph entirely. It touches nothing about the production
// build, so build output stays identical.
function serveMediapipeWasmLoaderInDev(): Plugin {
  const wasmDir = join(rootDir, "public", "models", "mediapipe", "wasm");
  const urlPrefix = "/models/mediapipe/wasm/";
  return {
    name: "guitar-tutor:serve-mediapipe-wasm-loader-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?")[0];
        // Only the Emscripten glue .js files hit the module-transform path and
        // fail; the .wasm/.data binaries are fetched (not imported) and already
        // served correctly by Vite's public-dir middleware. Stay surgical.
        if (!pathname.startsWith(urlPrefix) || extname(pathname) !== ".js") {
          return next();
        }
        const filePath = normalize(join(wasmDir, pathname.slice(urlPrefix.length)));
        // Path-traversal guard: never serve outside the wasm dir.
        if (!filePath.startsWith(wasmDir) || !existsSync(filePath)) {
          return next();
        }
        res.setHeader("Content-Type", "text/javascript");
        // Same-origin, but be explicit so COEP: require-corp never blocks it.
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(filePath));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveMediapipeWasmLoaderInDev()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
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
