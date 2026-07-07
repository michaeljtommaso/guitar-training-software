// BUG-003: TF.js's browser platform (`PlatformBrowser.setTimeoutCustom`) calls
// `window.setTimeout` unconditionally. The notes worker (notesWorker.ts) runs
// Basic Pitch (@spotify/basic-pitch, which runs on TF.js) inside a Web Worker,
// where the global scope is `self`, not `window` — so evaluating the model
// throws `ReferenceError: window is not defined` and note detection dies
// (`Notes: — bp 0`). This module aliases `window` to the worker's own global
// scope BEFORE any TF.js/basic-pitch code runs.
//
// Import ordering (why this is safe as a separate module): ES `import`
// declarations are hoisted, but module EVALUATION still happens in a
// depth-first, source-order walk of the dependency graph — each imported
// module's top-level code fully runs before control returns to evaluate the
// next sibling import in the importing file. This module has no imports of
// its own, so as long as it is the FIRST import statement (textually) in
// notesWorker.ts — i.e. it appears before `import { BasicPitchNoteSource }
// from "./basicPitchSource"` — its single line of top-level code is
// guaranteed to run before basicPitchSource.ts's import chain
// (-> @spotify/basic-pitch -> TF.js) is evaluated.
//
// `??=` makes this a no-op wherever `window` already exists (main thread,
// jsdom test environments, real browsers) — safe even if this module is
// imported somewhere other than the worker.
(globalThis as unknown as { window?: typeof globalThis }).window ??= globalThis;
