// Practice screen (spec v2-ui §5): the CSS grid that replaces SetupWizard as
// the persistent practice console — camera pane (dominant) + zoom-pane slot +
// hint-bar slot on the left, the ~320px CoachColumn on the right. TopBar and
// TelemetryFooter are optional slot props (parallel tasks — T2), so this
// component mounts and is fully testable standalone.
//
// The camera pane lifts the EXISTING video + OverlayCanvas mount pattern and
// calibration-mode logic from SetupWizard.tsx AS-IS (that file is read-only
// for this task) and adds two new overlay chips that only READ existing
// stores: the TARGET card (bottom-left) and the per-string status chips
// (bottom-right, practice mode only — same data as today's LessonPanel
// chips). Device selects/Start-Stop only appear here for the "skipped the
// wizard, capture isn't running yet" edge case (spec §9); once running they
// live in the TopBar input badge / ConsoleDrawer "Inputs" section (§3), so
// they are intentionally NOT shown while `running`.
import { type ReactNode, useRef, useState, useSyncExternalStore } from "react";
import { useCaptureStore } from "../capture/captureStore";
import { listCaptureDevices, pickPreferredAudioInput } from "../capture/devices";
import { startCapture, MANUAL_TAP_ORDER, type CaptureHandles } from "../capture/controller";
import type { Point } from "../perception/vision/homography";
import { OverlayCanvas } from "../overlay/OverlayCanvas";
import { useExploreStore, type ExploreTarget } from "../explore/exploreStore";
import { getFusionSnapshot, subscribeFusion, type FusionSnapshot } from "../fusion/fusionStore";
import { getLesson, type LessonStep } from "../fusion/lessons";
import { stringName } from "../fusion/engine";
import type { Voicing } from "../theory/chords";
import type { StatusKey } from "../theme/statusColors";
import { CoachColumn } from "./CoachColumn";
import "./PracticeScreen.css";

const STATUS_LABEL: Record<StatusKey, string> = {
  correct: "ok",
  warn: "check",
  error: "off",
  uncertain: "—",
};

// ── pure helpers (unit-tested directly — spec §10) ──────────────────────────

/**
 * Traditional low-string→high-string spelling ("x 3 2 0 1 0") from a lesson
 * step's canonical fingering. `avoid_strings` → "x"; a fingered string → its
 * fret; an `expected_strings` entry with no finger on it → open ("0").
 */
export function fingeringSpelling(
  step: Pick<LessonStep, "accepted_fingerings" | "expected_strings" | "avoid_strings">,
): string {
  const fingering = step.accepted_fingerings[0];
  const fretOnString = new Map<number, number>();
  for (const p of Object.values(fingering)) {
    if (p) fretOnString.set(p.string, p.fret);
  }
  const cells: string[] = [];
  for (let s = 6; s >= 1; s--) {
    if (step.avoid_strings.includes(s)) cells.push("x");
    else if (fretOnString.has(s)) cells.push(String(fretOnString.get(s)));
    else if (step.expected_strings.includes(s)) cells.push("0");
    else cells.push("x");
  }
  return cells.join(" ");
}

/** Same "x 3 2 0 1 0" convention from a chords-db Voicing (frets[0] = string
 *  1/high-e per theory/chords.ts — reverse to get low→high display order). */
export function voicingSpelling(voicing: Voicing): string {
  return voicing.frets
    .slice()
    .reverse()
    .map((f) => (f < 0 ? "x" : String(f)))
    .join(" ");
}

/** "C" / "Am" / "A7" style short chord names — spelled-out qualities read as
 *  noise next to a fret spelling, so major/minor collapse to the usual
 *  shorthand and everything else (7/m7/maj7/sus2/sus4…) just appends. */
function chordDisplayName(root: string, suffix: string): string {
  if (suffix === "major") return root;
  if (suffix === "minor") return `${root}m`;
  return `${root}${suffix}`;
}

export interface TargetCardData {
  name: string;
  spelling: string | null;
}

/** TARGET card content (spec §5): active lesson step fingering in practice
 *  mode, or the explore chord/voicing (scales have no spelling) in explore
 *  mode. Returns null when there's nothing to show (no active lesson / no
 *  explore target yet). */
export function deriveTargetCard(
  mode: "practice" | "explore",
  fusionSnap: Pick<FusionSnapshot, "lessonId" | "stepIndex" | "targetChord">,
  exploreTarget: ExploreTarget,
): TargetCardData | null {
  if (mode === "practice") {
    if (!fusionSnap.lessonId) return null;
    const lesson = getLesson(fusionSnap.lessonId);
    const step = lesson?.steps[fusionSnap.stepIndex];
    if (!step) return null;
    return { name: fusionSnap.targetChord ?? step.chord, spelling: fingeringSpelling(step) };
  }
  if (!exploreTarget) return null;
  if (exploreTarget.kind === "chord") {
    const voicing = exploreTarget.voicings[exploreTarget.active];
    return {
      name: chordDisplayName(exploreTarget.root, exploreTarget.suffix),
      spelling: voicing ? voicingSpelling(voicing) : null,
    };
  }
  return { name: `${exploreTarget.root} ${exploreTarget.scaleType} scale`, spelling: null };
}

// ── camera pane ──────────────────────────────────────────────────────────────

function StringChips({ snap }: { snap: FusionSnapshot }) {
  return (
    <div className="camera-chips" data-testid="string-chips">
      {[6, 5, 4, 3, 2, 1].map((s) => {
        const st: StatusKey = snap.stringStatus?.[s] ?? "uncertain";
        return (
          <span key={s} className={`camera-chip ${st}`} title={`${stringName(s)}: ${st}`}>
            {stringName(s)} {STATUS_LABEL[st]}
          </span>
        );
      })}
    </div>
  );
}

function TargetCard({ data }: { data: TargetCardData }) {
  return (
    <div className="target-card" data-testid="target-card">
      <span className="target-card-eyebrow">Target</span>
      <span className="target-card-name">{data.name}</span>
      {data.spelling && <span className="target-card-spelling">{data.spelling}</span>}
    </div>
  );
}

function CameraPane() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handlesRef = useRef<CaptureHandles | null>(null);
  const autoPicked = useRef(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const { cameras, mics, cameraId, micId, phase, error, setDevices, select, setPhase } =
    useCaptureStore();
  const mode = useExploreStore((s) => s.mode);
  const exploreTarget = useExploreStore((s) => s.target);
  const fusionSnap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);

  const running = phase === "running";

  // ── capture start/stop (lifted as-is from SetupWizard.tsx) ────────────────
  const start = async (videoDeviceId: string, audioDeviceId: string) => {
    const video = videoRef.current;
    if (!video) return;
    handlesRef.current?.stop();
    handlesRef.current = null;
    setVideoEl(null);
    setPhase("starting");
    try {
      handlesRef.current = await startCapture(video, {
        videoDeviceId: videoDeviceId || undefined,
        audioDeviceId: audioDeviceId || undefined,
      });
      const lists = await listCaptureDevices(); // labels appear after permission
      setDevices(lists);
      // ADR-013: auto-prefer a direct-input interface on first run if the user
      // has never chosen a mic. Guarded to run at most once per session.
      if (!autoPicked.current && !audioDeviceId) {
        autoPicked.current = true;
        const preferred = pickPreferredAudioInput(lists.mics);
        if (preferred) {
          select({ micId: preferred.deviceId });
          void start(videoDeviceId, preferred.deviceId); // restart on the interface
          return;
        }
      }
      setVideoEl(video);
      setPhase("running");
    } catch (err) {
      // A persisted cameraId/micId (gt-capture-devices) can go stale if the
      // device was unplugged since last session; getUserMedia's exact-match
      // deviceId constraint then throws OverconstrainedError. Clear the
      // stale ids and retry once on system defaults.
      if (err instanceof Error && err.name === "OverconstrainedError" && (videoDeviceId || audioDeviceId)) {
        select({ cameraId: "", micId: "" });
        void start("", ""); // retry once on system defaults
        return;
      }
      setPhase("error", err instanceof Error ? err.message : String(err));
    }
  };

  // ── fretboard calibration (lifted as-is from SetupWizard.tsx) ─────────────
  const [calibMode, setCalibMode] = useState(false);
  const [taps, setTaps] = useState<Point[]>([]);
  const [calibMsg, setCalibMsg] = useState("");

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!calibMode || !handlesRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tap: Point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const next = [...taps, tap];
    if (next.length >= 4) {
      handlesRef.current.setManualCalibration(next);
      setTaps([]);
      setCalibMode(false);
      setCalibMsg("Calibrated from 4 taps (manual).");
    } else {
      setTaps(next);
    }
  };

  const toggleCalibMode = () => {
    setTaps([]);
    setCalibMode((m) => !m);
    setCalibMsg(calibMode ? "" : "Tap the four fretboard corners in order.");
  };

  const detectCharuco = async () => {
    if (!handlesRef.current) return;
    setCalibMsg("Detecting ChArUco board…");
    try {
      const n = await handlesRef.current.calibrateCharuco();
      setCalibMsg(n > 0 ? `Calibrated from ChArUco (${n} corners).` : "No ChArUco board detected in frame.");
    } catch (err) {
      setCalibMsg(`ChArUco error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearCalib = () => {
    handlesRef.current?.clearCalibration();
    setTaps([]);
    setCalibMode(false);
    setCalibMsg("Calibration cleared.");
  };

  const targetCard = deriveTargetCard(mode, fusionSnap, exploreTarget);
  const showChips = mode === "practice" && fusionSnap.lessonId !== null;

  return (
    <div className="camera-pane" data-testid="camera-pane">
      <div
        className="video-stage"
        data-testid="video-stage"
        onClick={onStageClick}
        style={calibMode ? { cursor: "crosshair" } : undefined}
      >
        <video ref={videoRef} muted playsInline autoPlay />
        {videoEl && <OverlayCanvas video={videoEl} />}

        {!running && phase === "error" && (
          <div className="camera-edge-card" data-testid="capture-error-card">
            <p className="camera-edge-title">Could not start capture</p>
            <p className="camera-edge-message">{error}</p>
            <button type="button" data-testid="capture-retry" onClick={() => void start(cameraId, micId)}>
              Retry
            </button>
          </div>
        )}

        {!running && phase !== "error" && (
          <div className="camera-edge-card" data-testid="capture-start-card">
            <p className="camera-edge-title">Start capture</p>
            <div className="camera-edge-controls">
              <label>
                Camera{" "}
                <select value={cameraId} onChange={(e) => select({ cameraId: e.target.value })}>
                  <option value="">Default camera</option>
                  {cameras.map((c) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Microphone{" "}
                <select value={micId} onChange={(e) => select({ micId: e.target.value })}>
                  <option value="">Default microphone</option>
                  {mics.map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label || `Microphone ${m.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                data-testid="capture-start"
                disabled={phase === "starting"}
                onClick={() => void start(cameraId, micId)}
              >
                {phase === "starting" ? "Starting…" : "Start capture"}
              </button>
            </div>
          </div>
        )}

        {running && (
          <div className="camera-calibrate">
            <button
              type="button"
              className="ghost-button calibrate-button"
              data-testid="calibrate-button"
              onClick={toggleCalibMode}
            >
              {calibMode ? "Cancel calibration" : "Calibrate"}
            </button>
            {calibMode ? (
              <span className="camera-pane-tip" data-testid="calibrate-tap-hint">
                Tap {MANUAL_TAP_ORDER[taps.length]?.label} ({taps.length}/4)
              </span>
            ) : (
              <>
                {/* Not named as its own row in spec §3's terse table, but "nothing
                    gets dropped" (§3 preamble) — ChArUco detect + reset stay
                    reachable as secondary ghost actions next to `calibrate`. */}
                <button type="button" className="ghost-button" onClick={() => void detectCharuco()}>
                  Detect ChArUco
                </button>
                <button type="button" className="ghost-button" onClick={clearCalib}>
                  Clear calibration
                </button>
                {calibMsg && <span className="camera-pane-tip">{calibMsg}</span>}
              </>
            )}
          </div>
        )}

        {running && targetCard && <TargetCard data={targetCard} />}
        {running && showChips && <StringChips snap={fusionSnap} />}
      </div>
    </div>
  );
}

// ── screen shell ─────────────────────────────────────────────────────────────

export interface PracticeScreenProps {
  /** TopBar (spec §5/T2) — parallel task; optional so this mounts standalone. */
  topBar?: ReactNode;
  /** HintBar (spec §5/T2) — parallel task; optional so this mounts standalone. */
  hintBar?: ReactNode;
  /** TelemetryFooter (spec §5/T2) — parallel task; optional so this mounts standalone. */
  footer?: ReactNode;
  /** ZoomPane (spec §6/T4) — parallel task; falls back to a mount-point
   *  placeholder (testid `zoom-pane`) so this mounts standalone. */
  zoomPane?: ReactNode;
}

export function PracticeScreen({ topBar, hintBar, footer, zoomPane }: PracticeScreenProps) {
  return (
    <div className="practice-screen" data-testid="practice-screen">
      {topBar}
      <div className="practice-screen-grid">
        <div className="practice-main">
          <CameraPane />
          <div className="zoom-pane-slot">
            {zoomPane ?? <div className="zoom-pane-placeholder" data-testid="zoom-pane" />}
          </div>
          {hintBar}
        </div>
        <CoachColumn />
      </div>
      {footer}
    </div>
  );
}
