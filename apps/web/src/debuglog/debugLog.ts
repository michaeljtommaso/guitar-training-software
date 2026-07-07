// Field-testing debug logger (docs/superpowers/sdd/debuglog-brief.md).
//
// Pure logic + localStorage-backed storage, no React. The snapshot collects
// ONLY from existing stores/helpers — never invents a field. Anything without
// a real, currently-available source (e.g. the tone-chain's measured output
// latency, which lives on a live ToneChainHandles reference this module never
// holds; the app's build version, which isn't wired into any bundler define)
// is OMITTED rather than faked — the same hard rule TelemetryFooter's
// composeTelemetryLine already follows. ZERO network: this module never
// fetches/posts anything (see debugLog.test.ts "zero network").
import { useExploreStore } from "../explore/exploreStore";
import { getFusionSnapshot } from "../fusion/fusionStore";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput, type AudioInputKind } from "../capture/devices";
import { getSnapshot as getPerceptionSnapshot, visionHot } from "../perception/perceptionStore";
import { audioGlassToWorkerHistogram } from "../observability/latencyHistogram";
import { composeTelemetryLine } from "../shell/TelemetryFooter";
import { useToneStore } from "../tone/toneStore";
import type { MonitorMode } from "../tone/toneChain";
import type { CapturePhase } from "../capture/captureStore";
import { resolveInitialTheme, type Theme } from "../theme/theme";

const STORAGE_KEY = "gt-debug-log";
const MAX_ENTRIES = 200;

export interface DebugSnapshot {
  mode: "practice" | "explore";
  /** Active lesson (practice mode only) — omitted when no lesson is running. */
  lesson?: { id: string; stepIndex: number };
  /** Explore-mode target summary — omitted in practice mode / no target picked yet. */
  exploreTarget?:
    | { kind: "chord"; root: string; suffix: string; voicingIndex: number }
    | { kind: "scale"; root: string; scaleType: string };
  capture: {
    phase: CapturePhase;
    cameraLabel?: string;
    micLabel?: string;
    micKind?: AudioInputKind;
  };
  /** Whether an image→fretboard homography is calibrated — the same signal
   *  the overlay gates on (perception/perceptionStore.ts `visionHot.H`). */
  calibrated: boolean;
  audio: {
    chordLabel?: string;
    chordConf?: number;
    tunerNote?: string;
    tunerCents?: number;
    /** Cumulative onset count this session — always a real, cheap counter. */
    onsetCount: number;
  };
  /** Reuses TelemetryFooter's own composeTelemetryLine — never duplicated. */
  telemetryLine: string;
  tone: {
    preset: string | null;
    monitor: MonitorMode;
    drive: number;
    gateDb: number;
    bassDb: number;
    midDb: number;
    trebleDb: number;
    presenceDb: number;
  };
  theme: Theme;
  userAgent: string;
}

export interface DebugEntry {
  /** ISO timestamp, stamped at appendEntry() call time. */
  t: string;
  note: string;
  snapshot: DebugSnapshot;
}

/** Build a snapshot from the CURRENT state of every existing store/helper. */
export function captureSnapshot(): DebugSnapshot {
  const explore = useExploreStore.getState();
  const fusion = getFusionSnapshot();
  const capture = useCaptureStore.getState();
  const perception = getPerceptionSnapshot();
  const tone = useToneStore.getState();

  const mode = explore.mode;

  const lesson: DebugSnapshot["lesson"] =
    mode === "practice" && fusion.lessonId ? { id: fusion.lessonId, stepIndex: fusion.stepIndex } : undefined;

  let exploreTarget: DebugSnapshot["exploreTarget"];
  if (mode === "explore" && explore.target) {
    const t = explore.target;
    exploreTarget =
      t.kind === "chord"
        ? { kind: "chord", root: t.root, suffix: t.suffix, voicingIndex: t.active }
        : { kind: "scale", root: t.root, scaleType: t.scaleType };
  }

  const cameraLabel = capture.cameras.find((c) => c.deviceId === capture.cameraId)?.label || undefined;
  const micLabel = capture.mics.find((m) => m.deviceId === capture.micId)?.label || undefined;
  const micKind = micLabel ? classifyAudioInput(micLabel) : undefined;

  const chord = perception.audioAnalysis?.chord ?? null;
  const tuning = perception.audioAnalysis?.tuning ?? null;

  const telemetryLine = composeTelemetryLine({
    backend: perception.backend,
    frameDriver: perception.frameDriver,
    audio: perception.audio,
    visionFrames: perception.visionFrames,
    glassP50: audioGlassToWorkerHistogram.p50,
    glassP95: audioGlassToWorkerHistogram.p95,
    diagnoses: fusion.counts.diagnoses,
    hints: fusion.counts.hints,
  });

  return {
    mode,
    lesson,
    exploreTarget,
    capture: {
      phase: capture.phase,
      cameraLabel,
      micLabel,
      micKind,
    },
    calibrated: visionHot.H !== null,
    audio: {
      chordLabel: chord?.label,
      chordConf: chord?.conf,
      tunerNote: tuning?.name,
      tunerCents: tuning?.cents,
      onsetCount: perception.eventCounts.onset,
    },
    telemetryLine,
    tone: {
      preset: tone.preset,
      monitor: tone.params.monitor,
      drive: tone.params.drive,
      gateDb: tone.params.gateDb,
      bassDb: tone.params.bassDb,
      midDb: tone.params.midDb,
      trebleDb: tone.params.trebleDb,
      presenceDb: tone.params.presenceDb,
    },
    theme: resolveInitialTheme(),
    userAgent: navigator.userAgent,
  };
}

/** Read the persisted log. Corrupt/foreign JSON is treated as an empty log —
 *  never throws (spec: "corrupt-data-safe"). */
export function getEntries(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DebugEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: DebugEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* best-effort persistence — same convention as theme.ts */
  }
}

/** Snapshot NOW and append a new entry, capped at 200 (drops oldest first). */
export function appendEntry(note: string): DebugEntry {
  const entry: DebugEntry = { t: new Date().toISOString(), note, snapshot: captureSnapshot() };
  const entries = getEntries();
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  saveEntries(entries);
  return entry;
}

export function clearEntries(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort — matches saveEntries */
  }
}

/** Flatten one snapshot into ordered, parseable `key: value` lines. Fixed key
 *  order (not `Object.entries`) so the doc is deterministic across runs; a
 *  field is only emitted when its value is actually present (omit, don't fake). */
function snapshotLines(s: DebugSnapshot): string[] {
  const lines: string[] = [];
  const push = (key: string, value: string | number | boolean | null | undefined) => {
    if (value === undefined) return;
    lines.push(`${key}: ${value === null ? "(none)" : value}`);
  };

  push("mode", s.mode);
  if (s.lesson) {
    push("lesson.id", s.lesson.id);
    push("lesson.stepIndex", s.lesson.stepIndex);
  }
  if (s.exploreTarget) {
    push("exploreTarget.kind", s.exploreTarget.kind);
    push("exploreTarget.root", s.exploreTarget.root);
    if (s.exploreTarget.kind === "chord") {
      push("exploreTarget.suffix", s.exploreTarget.suffix);
      push("exploreTarget.voicingIndex", s.exploreTarget.voicingIndex);
    } else {
      push("exploreTarget.scaleType", s.exploreTarget.scaleType);
    }
  }
  push("capture.phase", s.capture.phase);
  push("capture.cameraLabel", s.capture.cameraLabel);
  push("capture.micLabel", s.capture.micLabel);
  push("capture.micKind", s.capture.micKind);
  push("calibrated", s.calibrated);
  push("audio.chordLabel", s.audio.chordLabel);
  push("audio.chordConf", s.audio.chordConf);
  push("audio.tunerNote", s.audio.tunerNote);
  push("audio.tunerCents", s.audio.tunerCents);
  push("audio.onsetCount", s.audio.onsetCount);
  push("telemetryLine", s.telemetryLine);
  push("tone.preset", s.tone.preset);
  push("tone.monitor", s.tone.monitor);
  push("tone.drive", s.tone.drive);
  push("tone.gateDb", s.tone.gateDb);
  push("tone.bassDb", s.tone.bassDb);
  push("tone.midDb", s.tone.midDb);
  push("tone.trebleDb", s.tone.trebleDb);
  push("tone.presenceDb", s.tone.presenceDb);
  push("theme", s.theme);
  push("userAgent", s.userAgent);

  return lines;
}

/** Render the full log as ONE deterministic, parseable markdown doc: a header
 *  (generated date, current user agent, entry count — app version is
 *  intentionally omitted, see debugLog-report.md) followed by one `## [t]`
 *  section per entry (note as a blockquote, snapshot as a fenced key:value
 *  block). No HTML. */
export function renderMarkdown(entries: DebugEntry[]): string {
  const lines: string[] = [
    "# Guitar Trainer Debug Log",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- User agent: ${navigator.userAgent}`,
    `- Entries: ${entries.length}`,
    "",
  ];

  for (const entry of entries) {
    lines.push(`## [${entry.t}]`, "", `> ${entry.note}`, "", "```", ...snapshotLines(entry.snapshot), "```", "");
  }

  return lines.join("\n");
}

/** Trigger a browser download of the full log as `guitar-debug-YYYY-MM-DD.md`
 *  (Blob + anchor click — no network involved). */
export function downloadMarkdown(): void {
  const md = renderMarkdown(getEntries());
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `guitar-debug-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
