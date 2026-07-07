import { defineConfig } from "@playwright/test";

// BUG-002 regression guard. The main playwright.config.ts runs against the
// PRODUCTION build (`vite build` + `vite preview`) — which is exactly why the
// vision worker being dead in `vite dev` went uncaught for so long. This config
// exercises the DEV SERVER instead, so the dev-only wasm-loader path (worker
// bundling + MediaPipe glue served through Vite dev) stays covered.
export default defineConfig({
  testDir: "./e2e-dev",
  timeout: 90_000,
  reporter: "list",
  projects: [{ name: "chromium-dev", use: { browserName: "chromium" } }],
  use: {
    // Dedicated port, distinct from the preview e2e (5199), so the two suites
    // can run back-to-back without colliding.
    baseURL: "http://localhost:5198",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-audio-output",
      ],
    },
  },
  webServer: {
    // Copy the MediaPipe wasm into public/ (the predev hook), then run the DEV
    // server on a fixed port. The dev server — not preview — is the whole point
    // of this suite. Mirrors the preview config's `pnpm exec vite` style so
    // vite's CLI flags aren't swallowed by `pnpm run` arg forwarding.
    command: "pnpm run copy-vision-assets && pnpm exec vite --port 5198 --strictPort",
    url: "http://localhost:5198",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
