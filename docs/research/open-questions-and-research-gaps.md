# Open Questions & Research Gaps

> **Status:** Planning / architecture only. No application code yet.
> **Date:** 2026-07-02.
> **Companion docs:** [opus-stack-implementation-plan.md](../architecture/opus-stack-implementation-plan.md) · [technology-decision-records.md](../architecture/technology-decision-records.md) · [implementation-work-packages.md](../plans/implementation-work-packages.md)

The stack plan commits to a design; this doc is the honest ledger of what could still break it. Each entry states the **question/risk**, **why it matters** (what decision or gate it threatens), the **validation method** (the cheapest experiment that resolves it), the **owner lane**, and the **decision trigger** (the observation that forces a specific action). Entries are ordered roughly by how early they can sink the plan.

**Owner lanes:** `Perception` (audio/vision on-device) · `Fusion` (engine + policy) · `Model` (frontier/proxy) · `Data` (capture + annotation) · `Platform` (web/PWA/infra) · `Product` (scope + pedagogy).

**Severity:** `Critical` (invalidates a load-bearing ADR) · `High` (misses an MVP gate) · `Medium` (rework, not redesign).

---

## Q-01 — Can the browser hit the <250 ms corrective-hint budget with all models running concurrently? — Critical

- **Why it matters:** The entire two-speed architecture (ADR-008) and the PWA-first platform choice (ADR-001) assume on-device perception + fusion close the loop under 250 ms while HandLandmarker, Basic Pitch, CREPE, and onset DSP all contend for one main thread + GPU. If they can't, the platform decision flips to Tauri.
- **Validation method:** A WP-1/WP-2/WP-3 spike running all models together on the reference laptop, measuring end-to-end glass-to-hint latency and frame-drop rate under sustained load (not per-model microbenchmarks — the contention is the risk).
- **Owner lane:** Platform + Perception.
- **Decision trigger:** If the combined budget exceeds 250 ms on the reference laptop after worker/GPU tuning → pull Tauri forward from Beta (reopen ADR-001) or drop a model from the concurrent hot path.

---

## Q-02 — Does camera-space → fretboard-space mapping survive real occlusion, motion blur, and angle variance? — Critical

- **Why it matters:** The plan calls this "the honest hard part." Marker calibration (ADR-004) makes MVP *tractable*, but if homography + geometric fingertip mapping can't clear the 85% fingertip→fret/string gate under fretting-hand occlusion and strum blur, the differentiated core (fusion) has no reliable vision evidence to fuse.
- **Validation method:** WP-3 evaluation on a small deliberately-adversarial internal clip set (dark fretboards, low light, fast strums, hand occluding markers), reporting per-condition accuracy — not just the clean-setup average.
- **Owner lane:** Perception (vision).
- **Decision trigger:** If geometric mapping caps below 85% under occlusion after tuning → advance the learned contact classifier (ADR-006 reopen) and prioritize WP-6 data capture for those conditions.

---

## Q-03 — Is confidence-weighted fusion accurate enough to keep false critical feedback <5%? — Critical

- **Why it matters:** Trust is the product. A confident wrong correction costs more than a missed one (ADR-007). The <5% false-critical gate (WP-4) is the make-or-break pedagogical metric, and it depends on well-*calibrated* upstream confidences, which perception models are not guaranteed to produce.
- **Validation method:** WP-4 calibration study — reliability diagrams per confidence bucket on the internal labeled set; measure false-critical rate at candidate gate thresholds; ablate audio-only vs vision-only vs fused.
- **Owner lane:** Fusion.
- **Decision trigger:** If false-critical stays >5% at usably-sensitive thresholds → tighten confidence gates (accept more silence/misses), add a learned re-ranker behind the fixed taxonomy (ADR-007 reopen), or narrow the shipped mistake taxonomy.

---

## Q-04 — Will chroma/template chord matching alone clear the 90% open-chord gate? — High

- **Why it matters:** ADR-005 ships template matching first and defers the CRNN to Phase 1. If templates plateau below 90% on real (non-studio) home audio — cheap mics, room noise, ringing open strings — the WP-2 gate slips and the CRNN moves from "later" to "now."
- **Validation method:** WP-2 eval on GuitarSet/IDMT hold-outs **plus** a handful of real home-mic recordings; compare template accuracy against a quick CRNN baseline to size the gap.
- **Owner lane:** Perception (audio).
- **Decision trigger:** Template accuracy <90% on home-mic audio → pull the Phase-1 CRNN into MVP scope (reopen ADR-005) and secure Guitar-TECHS/GuitarSet training data.

---

## Q-05 — What real frontier model satisfies the coaching capability contract at acceptable cost? — High

- **Why it matters:** "Fable 5 Clubs" is an unverified placeholder (ADR-011). The four coaching modes assume streaming multimodal input, structured JSON output, sub-2 s first token, and bounded per-session cost. If no available model meets the contract affordably, coaching degrades to the template fallback and the "conversational coach" mode weakens.
- **Validation method:** A WP-5 bake-off behind the proxy across concrete equivalents (Claude/Fable-class, OpenAI Realtime, Gemini Live): measure first-token latency, keyframe-understanding quality on real clips, structured-output reliability, and cost per coaching turn.
- **Owner lane:** Model.
- **Decision trigger:** No provider clears the latency+cost bar → ship template-fallback-primary, keep the frontier path opt-in/premium, and re-scope the conversational mode.

---

## Q-06 — What is the actual per-session frontier cost, and does the kill-switch hold? — High

- **Why it matters:** Sending keyframes + event context on every pause can balloon token cost. ADR-012 mandates a *hard* cost cap ("an alert is not a cap"). Unbounded cost makes even opt-in coaching unshippable for a personal project.
- **Validation method:** Instrument the WP-5 proxy with per-session token accounting; load-test the kill-switch by simulating runaway usage and confirming spend actually halts (not just alerts).
- **Owner lane:** Model + Platform.
- **Decision trigger:** Projected per-session cost exceeds budget, or the kill-switch fails to halt spend under test → reduce keyframe frequency/resolution, cache/summarize context, and gate coaching behind explicit user action.

---

## Q-07 — Can we capture enough licensed multimodal data to ever earn markerless + learned models? — High

- **Why it matters:** The moat (WP-6) and the markerless roadmap (ADR-004/006 reopen) depend on proprietary video+audio+finger/string/fret+mistake-labeled data. No public dataset has webcam + pedagogy error labels. If capture stalls, the app is permanently marker-bound and the learned-model roadmap never starts.
- **Validation method:** A WP-6 pilot: label a controlled scripted-error session end-to-end in the annotation tool, measure minutes-to-label-per-clip and inter-annotator agreement on the mistake taxonomy; extrapolate to the volume a first detector needs.
- **Owner lane:** Data.
- **Decision trigger:** Labeling throughput or annotator agreement too low to reach a trainable set in reasonable effort → simplify the taxonomy, add semi-automated pre-labeling from the deterministic engine, or accept marker-only indefinitely.

---

## Q-08 — Is the mistake taxonomy pedagogically correct and teacher-endorsed? — High

- **Why it matters:** The bounded taxonomy (`wrong_fret`, `wrong_string`, `muted_string`, `behind_fret`, `missing_note`, `late_strum`, …) constrains both the deterministic loop and the frontier model (ADR-007/008). If teachers consider it wrong, incomplete, or mis-prioritized, the >75% teacher-agreement gate (WP-5) fails regardless of perception accuracy.
- **Validation method:** Early Product review with 2–3 guitar teachers on the taxonomy + feedback-priority ordering, *before* WP-4 locks the schema; dry-run canned diagnoses past them.
- **Owner lane:** Product + Fusion.
- **Decision trigger:** Teachers reject or materially reorder the taxonomy → revise the schema before WP-4 freezes it (cheap now, expensive after fusion is built).

---

## Q-09 — Do users actually reach the constrained reference setup (angle, marker, tuning, mono mic)? — Medium

- **Why it matters:** Every accuracy gate is stated "on the supported seated + marker setup." If the calibration wizard is too fiddly (printing a ChArUco board, positioning a clip cam), users never get to the setup the models assume, and real-world accuracy diverges sharply from the eval numbers.
- **Validation method:** Usability dry-run of the WP-1 setup wizard with a few non-expert users; measure calibration success rate and time-to-first-lesson; test the manual-tap fallback for the no-printer case.
- **Owner lane:** Product + Platform.
- **Decision trigger:** A large fraction can't calibrate unaided → invest in the manual-tap fallback UX, on-screen alignment guidance, or an auto-calibration assist before Beta.

---

## Q-10 — Chunking latency vs accuracy for Basic Pitch / CREPE ONNX in-browser. — Medium

- **Why it matters:** Basic Pitch "works best on solo guitar" and must be chunked for near-real-time; CREPE needs a manual ONNX export. Chunk size trades detection accuracy against the ~40–90 ms audio-loop budget (ADR-005/§14). Wrong chunking either misses onsets or blows the budget.
- **Validation method:** WP-2 sweep of chunk/hop sizes measuring accuracy vs latency on the audio hold-out; confirm the exported CREPE ONNX matches reference outputs.
- **Owner lane:** Perception (audio).
- **Decision trigger:** No chunk size satisfies both accuracy and the latency budget → lean on the custom onset detector for timing and use Basic Pitch only for slower note-set validation, not the real-time path.

---

## Q-11 — WebGPU/WASM behavior across the target browser matrix (esp. Firefox-Linux, iOS 26). — Medium

- **Why it matters:** ADR-001/012 promise a WASM/CPU fallback for the Firefox-Linux and older-Safari segment. WebGPU reached Baseline Jan 2026, but Firefox-on-Linux was "still tracking" and iOS 26 is newly viable — untested paths can silently fall back to slow CPU inference and miss latency budgets on those clients.
- **Validation method:** Run the WP-1 capability probe + WP-2/WP-3 loops across the real browser matrix (Chromium, Safari 26/iOS 26, Firefox Win/macOS/Linux); log which EP is selected and the resulting latency per platform.
- **Owner lane:** Platform.
- **Decision trigger:** A target browser falls back to CPU and misses budget → document it as unsupported-for-real-time (review-companion only) or ship a reduced-model profile for that client.

---

## Q-12 — Does disabling browser audio DSP expose the loop to room noise/hum? — Medium

- **Why it matters:** ADR-004 disables echo cancellation, noise suppression, and AGC because they corrupt instrument analysis — but that also removes the browser's noise handling. In a noisy room or with mains hum, onset/chord detection could degrade below the WP-2 gate.
- **Validation method:** WP-2 A/B of detection accuracy with browser DSP off vs on, plus a light custom pre-filter (hum notch / high-pass), across quiet and noisy rooms.
- **Owner lane:** Perception (audio).
- **Decision trigger:** Noise materially degrades accuracy → add a minimal, instrument-safe custom pre-filter in the AudioWorklet (not the browser's voice DSP).

---

## Gap index

| ID | Risk | Lane | Severity | Resolved by |
|---|---|---|---|---|
| Q-01 | Concurrent-model latency budget | Platform/Perception | Critical | WP-1–3 spike |
| Q-02 | Fretboard mapping under occlusion | Perception | Critical | WP-3 eval |
| Q-03 | Fusion false-critical <5% | Fusion | Critical | WP-4 calibration |
| Q-04 | Template chord accuracy ≥90% | Perception | High | WP-2 eval |
| Q-05 | Real model meets coaching contract | Model | High | WP-5 bake-off |
| Q-06 | Per-session cost + kill-switch | Model/Platform | High | WP-5 load test |
| Q-07 | Enough licensed multimodal data | Data | High | WP-6 pilot |
| Q-08 | Taxonomy teacher-endorsed | Product/Fusion | High | pre-WP-4 review |
| Q-09 | Users reach reference setup | Product/Platform | Medium | WP-1 usability |
| Q-10 | Chunking latency vs accuracy | Perception | Medium | WP-2 sweep |
| Q-11 | WebGPU/WASM browser matrix | Platform | Medium | WP-1–3 matrix run |
| Q-12 | Room noise w/ browser DSP off | Perception | Medium | WP-2 A/B |
</content>
