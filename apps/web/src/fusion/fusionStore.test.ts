// fusionStore CLOCK-BRIDGING tests. The engine assumes ONE clock; the two legs
// arrive on THREE origins (audio clock, vision-worker performance.now(), main
// performance.now()). These tests pin the wall-clock bridge that reconciles
// them and guard against the reviewer's blocker regression.
// All numbers are SYNTHETIC — no accuracy claim is made or implied.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_CONFIG } from "./engine";
import { flagTipWrong, fusionIngest, getFusionSnapshot, startLesson, stopLesson } from "./fusionStore";

const TTL = DEFAULT_ENGINE_CONFIG.assignsTtlMs; // 2000 ms

// ── modeled clock topology (the real system, made explicit) ─────────────────
// Page loads at NAV_START (main performance.now() origin = navigationStart).
// The user waits G ms, then clicks Start capture — that spawns the AudioContext
// AND the vision worker, so BOTH the audio clock and the vision worker's
// performance.now() have origin CTX_START. Date.now() (wall) is the one clock
// every agent shares directly.
const NAV_START = 1_700_000_000_000; // epoch ms at page load
const G = 5000; // user waited 5 s before starting capture (> TTL — this is the bug trigger)
const CTX_START = NAV_START + G; // audio ctx + vision worker spawn (capture click)

const wallAt = (audioMs: number) => CTX_START + audioMs; // Date.now() for an audio-clock moment
const workerAt = (audioMs: number) => audioMs; // vision worker perf.now() (CTX_START origin)
const mainPerfAt = (audioMs: number) => audioMs + G; // main perf.now() (NAV_START origin)

describe("clock bridging — dual-clock regression (reviewer blocker)", () => {
  it("new wall-anchored bridge keeps skewed-clock vision fresh; the OLD main-origin formula drops it", () => {
    const anchorA = 20; // audio moment the wall↔audio anchor was sampled
    const visionA = 120; // audio moment a hand shape was detected
    const evalA = 600; // audio moment an audio-triggered evaluation runs

    // NEW: offset from the (audio, wall) pair sampled TOGETHER in the worklet,
    // applied to the vision batch's Date.now() stamp. No worker-origin math.
    const offset = wallAt(anchorA) - anchorA; // = CTX_START
    const newAssignsT = wallAt(visionA) - offset; // = visionA (exact)
    expect(newAssignsT).toBe(visionA);
    expect(evalA - newAssignsT).toBeLessThan(TTL); // FRESH → vision leg participates

    // OLD (the bug): offset from the MAIN thread's performance.now(), applied to
    // the vision WORKER's performance.now() — two different origins. The offset
    // silently carries the whole page-load→capture gap G.
    const oldOffset = mainPerfAt(anchorA) - anchorA; // = G
    const oldAssignsT = workerAt(visionA) - oldOffset; // = visionA − G
    expect(oldAssignsT).toBe(visionA - G);
    expect(evalA - oldAssignsT).toBeGreaterThan(TTL); // STALE → dropped → fusion collapses to audio-only
  });
});

// ── synthetic event builders (standard string numbering: 1 = high e) ─────────
const onset = (t: number) => ({ t, kind: "onset", strength: 1, conf: 0.9 });
const chord = (t: number, label: string, conf: number) => ({ t, kind: "chord", label, conf });
const notes = (t: number, pitches: number[], conf = 0.9) => ({ t, kind: "notes", pitches, conf });
// Open C with the HIGH E (string 1, E4=64) absent — its pitch class still rings
// on string 4 (E3=52), so the absence is octave-ambiguous by design (case a).
const C_NO_HIGH_E = [48, 52, 55, 60];
// Canonical open-C shape (index 2/1, middle 4/2, ring 5/3), matching the lesson.
const cShape = (t: number) => ({
  t,
  kind: "fingerAssign",
  assigns: [
    { finger: "index", string: 2, fret: 1, conf: 0.9 },
    { finger: "middle", string: 4, fret: 2, conf: 0.9 },
    { finger: "ring", string: 5, fret: 3, conf: 0.9 },
  ],
});

describe("clock bridging — cross-leg diagnosis through the REAL ingest path", () => {
  afterEach(() => stopLesson());

  it("skewed-clock vision + audio-missing-note → missing_note citing BOTH legs", () => {
    expect(startLesson("open_chords_c_major")).toBe(true);

    // 1) Audio anchor lands first (audio flows from capture start). This sets the
    //    wall↔audio offset the vision leg needs.
    fusionIngest([onset(20)], "audio", { wallMs: wallAt(20), audioMs: 20 });

    // 2) Vision batch on the WORKER clock (worker origin = capture, i.e. offset
    //    from main by G). Its own `t` is a skewed worker stamp that the bridge
    //    MUST ignore in favour of the Date.now() wall stamp. calibConf + assigns.
    fusionIngest(
      [
        { t: workerAt(120), kind: "calib", homographyConf: 0.9 },
        cShape(workerAt(120)),
      ],
      "vision",
      { wallMs: wallAt(120) },
    );

    // 3) Audio hears C, then 4) notes reveal the high e is absent (octave-ambiguous).
    fusionIngest([chord(300, "C", 0.7)], "audio", { wallMs: wallAt(300), audioMs: 300 });
    fusionIngest([notes(600, C_NO_HIGH_E, 0.8)], "audio", { wallMs: wallAt(600), audioMs: 600 });

    const d = getFusionSnapshot().lastDiagnosis!;
    expect(d).not.toBeNull();
    expect(d.code).toBe("missing_note");
    // Cross-leg: evidence cites BOTH legs (this is exactly what the old clock bug
    // suppressed — vision aged out and only the audio leg survived).
    expect(d.evidence.audio).toContain("high e");
    expect(d.evidence.vision).toContain("shape matches C");
    expect(d.conf).toBeGreaterThan(0.5); // both legs → confident, not a single-leg cap
  });
});

describe("silence gate at the fusion ingest point (BUG-001 / RESULT-002 Problem 1)", () => {
  afterEach(() => stopLesson());

  it("a silence/noise-derived audio stream inside a live lesson produces NO diagnoses and NO hints", () => {
    expect(startLesson("open_chords_c_major")).toBe(true);
    // Idle mic during a lesson: the analyzer gates every frame to silence/noise.
    fusionIngest([chord(300, "silence", 1)], "audio", { wallMs: wallAt(300), audioMs: 300 });
    fusionIngest([chord(600, "noise", 1)], "audio", { wallMs: wallAt(600), audioMs: 600 });
    fusionIngest([chord(900, "silence", 1)], "audio", { wallMs: wallAt(900), audioMs: 900 });
    fusionIngest([chord(1200, "noise", 1)], "audio", { wallMs: wallAt(1200), audioMs: 1200 });
    const snap = getFusionSnapshot();
    expect(snap.counts.diagnoses).toBe(0);
    expect(snap.counts.hints).toBe(0);
    expect(snap.hint).toBeNull();
  });
});

describe("false-feedback complaint metric (WP-7, §16)", () => {
  afterEach(() => stopLesson());

  it("counts 'Tip was wrong' presses into the session snapshot", () => {
    expect(startLesson("open_chords_c_major")).toBe(true);
    expect(getFusionSnapshot().counts.complaints).toBe(0);
    flagTipWrong();
    flagTipWrong();
    expect(getFusionSnapshot().counts.complaints).toBe(2);
  });

  it("is a no-op with no active session", () => {
    stopLesson();
    flagTipWrong(); // must not throw
    expect(getFusionSnapshot().counts.complaints).toBe(0);
  });
});
