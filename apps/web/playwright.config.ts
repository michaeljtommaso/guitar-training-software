import { defineConfig } from "@playwright/test";

// Fake-device capture smoke (WP-1): chromium with synthetic camera/mic so the
// whole plumbing — gUM → video/rVFC, worklet → SAB ring → worker, capability
// probe, overlay — is exercised without physical hardware.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  reporter: "list",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    // Dedicated port — 5173 is commonly occupied by unrelated vite dev
    // servers on this machine, and reusing a foreign server tests the wrong
    // app. reuseExistingServer stays false for the same reason.
    baseURL: "http://localhost:5199",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        // Realtime AudioContexts are pulled by the OUTPUT device. Verified on
        // this machine (and true of headless CI generally): if the render
        // endpoint can't start (e.g. powered-down Bluetooth sink), the audio
        // clock freezes after one hardware buffer and the worklet never runs.
        // This flag swaps in Chromium's timer-driven fake output stream, so
        // the graph renders in real time with zero audio-hardware dependency.
        "--disable-audio-output",
      ],
    },
  },
  webServer: {
    // Serve the PRODUCTION build (vite preview), not dev: MediaPipe's
    // HandLandmarker import()s its wasm loader from /models, and vite's DEV
    // server refuses to serve /public files as modules. Preview serves /public
    // raw — the real shippable behavior. `pnpm build` also runs the
    // copy-vision-assets prebuild.
    command: "pnpm build && pnpm exec vite preview --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
