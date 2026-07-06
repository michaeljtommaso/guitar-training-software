# annotation-tool (WP-6 — data flywheel)

Internal labeling UI for the data pipeline described in `docs/architecture/opus-stack-implementation-plan.md` §13.
Load a local video, review synced waveform/spectrogram/fretboard-grid overlays, tag fingertip/string/fret
assignments and mistake-taxonomy ranges, and export/import JSON. No backend, no upload — everything is
local files (File input / download).

## License-gate scope (by design)

`scripts/check-licenses.mjs` (ADR-011) only scans `apps/web`'s production dependency closure — the
**shipped client**. This app is never bundled or shipped to end users, so it is intentionally **not**
covered by that gate. Its own dependencies (React, Zod, Zustand) are all MIT/Apache-2.0 regardless.

## Commands

```
pnpm --filter annotation-tool dev
pnpm --filter annotation-tool typecheck
pnpm --filter annotation-tool lint
pnpm --filter annotation-tool test
pnpm --filter annotation-tool build
```

Or from the repo root, `pnpm typecheck|lint|test|build` runs every workspace package including this one.

## Copied modules

A few modules are copied from `apps/web` rather than imported, so this app has no dependency on the
shipped client and apps/web stays untouched (WP-6 non-goal: no edits to apps/web source). Each copy has a
provenance header comment and, where a test existed, the test was copied too:

- `src/theme/tokens.css`, `src/theme/statusColors.ts` — design tokens.
- `src/shared/diagnosis.ts` — the `DIAGNOSIS_CODES` mistake taxonomy (from `apps/web/src/fusion/diagnosis.ts`).
- `src/shared/fft.ts` — the STFT (from `apps/web/src/perception/audio/dsp/fft.ts`).
- `src/shared/fretboard.ts` — fret/string spacing math (from `apps/web/src/perception/vision/fretboard.ts`).
- `src/shared/homography.ts` — 4-point DLT homography (from `apps/web/src/perception/vision/homography.ts`).

These are **not** a shared package — if the source files in `apps/web` change, re-sync these by hand.
