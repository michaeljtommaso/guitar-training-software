// TopBar (spec §5): lesson picker + mode toggle + step/next-step + tone
// preset + input badge + clock + theme toggle + console button. Reads the
// EXISTING stores directly (fusionStore, exploreStore, captureStore,
// toneStore) — no new state machines, just relocated chrome (spec §3 map).
//
// Theme + console-open are OWNED by AppShell (Wave C) and passed in as props
// — this component never initializes/persists theme or drawer state itself,
// so two independent "sources of truth" can't fight over localStorage/DOM.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun, TriangleAlert } from "lucide-react";
import { getFusionSnapshot, subscribeFusion, startLesson, stopLesson, setStep } from "../fusion/fusionStore";
import { lessons, getLesson } from "../fusion/lessons";
import { useExploreStore } from "../explore/exploreStore";
import { useCaptureStore } from "../capture/captureStore";
import { classifyAudioInput } from "../capture/devices";
import { useToneStore } from "../tone/toneStore";
import { TONE_PRESETS } from "../tone/presets";
import type { Theme } from "../theme/theme";
import "./shell.css";

const NO_LESSON = "";
const BROWSE_ALL = "__browse_all__";

export interface TopBarProps {
  theme: Theme;
  onToggleTheme: () => void;
  consoleOpen: boolean;
  onToggleConsole: () => void;
}

function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function TopBar({ theme, onToggleTheme, consoleOpen, onToggleConsole }: TopBarProps) {
  const snap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const mode = useExploreStore((s) => s.mode);
  const setMode = useExploreStore((s) => s.setMode);
  const { mics, micId } = useCaptureStore();
  const { preset, params, applyPreset } = useToneStore();

  const active = snap.lessonId !== null;

  // Lesson select combines "select" + "start/stop" (spec §3: LessonPanel's
  // lesson-select/start/stop all land here) — picking a lesson starts it
  // (startLesson stops any running one first), picking "no lesson" stops it.
  const onLessonChange = (id: string) => {
    if (id === BROWSE_ALL) return; // disabled row, but guard anyway
    if (id === NO_LESSON) {
      stopLesson();
      return;
    }
    startLesson(id);
    const lesson = getLesson(id);
    if (lesson?.tone_preset) applyPreset(lesson.tone_preset, { preserveMonitor: true });
  };

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const micLabel = mics.find((m) => m.deviceId === micId)?.label ?? mics[0]?.label ?? "";
  const kind = classifyAudioInput(micLabel);
  const feedbackRisk = kind === "mic" && params.monitor !== "off";
  const inputTag = kind === "interface" ? "DI" : kind === "mic" ? "MIC" : "IN";

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-group topbar-group--lesson">
        {lessons.length === 0 ? (
          <select className="topbar-lesson-picker" disabled data-testid="topbar-lesson-picker">
            <option>no lessons installed</option>
          </select>
        ) : (
          <select
            className="topbar-lesson-picker"
            data-testid="topbar-lesson-picker"
            value={active ? (snap.lessonId ?? NO_LESSON) : NO_LESSON}
            onChange={(e) => onLessonChange(e.target.value)}
          >
            <option value={NO_LESSON}>No lesson</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} · {l.steps.length} step{l.steps.length === 1 ? "" : "s"}
              </option>
            ))}
            <option value={BROWSE_ALL} disabled>
              Browse all lessons → (coming soon)
            </option>
          </select>
        )}

        <div className="topbar-mode-toggle" role="group" aria-label="Practice or Explore">
          <button
            type="button"
            data-testid="mode-practice"
            className={mode === "practice" ? "active" : ""}
            onClick={() => setMode("practice")}
          >
            Practice
          </button>
          <button
            type="button"
            data-testid="mode-explore"
            className={mode === "explore" ? "active" : ""}
            onClick={() => setMode("explore")}
          >
            Explore
          </button>
        </div>

        {mode === "practice" && active && (
          <span className="topbar-step" data-testid="topbar-step">
            <span className="topbar-step-count">
              step {snap.stepIndex + 1}/{snap.stepCount}
            </span>
            {snap.stepCount > 1 && (
              <button
                type="button"
                data-testid="topbar-next-step"
                onClick={() => setStep((snap.stepIndex + 1) % snap.stepCount)}
              >
                next step →
              </button>
            )}
          </span>
        )}
      </div>

      <div className="topbar-group topbar-group--status">
        <label className="topbar-tone-preset">
          tone ·{" "}
          <select
            data-testid="topbar-tone-preset"
            value={preset ?? ""}
            onChange={(e) => e.target.value && applyPreset(e.target.value)}
          >
            <option value="" disabled>
              Custom
            </option>
            {Object.keys(TONE_PRESETS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {/* §3: post-wizard input/capture changes live in the drawer's Inputs
            section — clicking the badge is the way there (T6). */}
        <button
          type="button"
          className={`topbar-input-badge${kind === "interface" ? " topbar-input-badge--interface" : ""}`}
          data-testid="topbar-input-badge"
          title={micLabel || "no input selected"}
          aria-label="Input settings (opens console)"
          onClick={onToggleConsole}
        >
          {inputTag} · {micLabel || "no input selected"}
          {feedbackRisk && (
            <TriangleAlert
              size={12}
              className="topbar-feedback-warn"
              data-testid="topbar-feedback-warning"
              aria-label="Feedback risk: mic input with monitoring on"
            />
          )}
        </button>

        <span className="topbar-clock" data-testid="topbar-clock">
          {formatClock(now)}
        </span>

        <button type="button" className="topbar-theme-toggle" onClick={onToggleTheme} data-testid="topbar-theme-toggle">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "dark" ? "light" : "dark"}
        </button>

        <button
          type="button"
          className="topbar-console-toggle"
          data-testid="topbar-console-toggle"
          aria-pressed={consoleOpen}
          onClick={onToggleConsole}
        >
          console
        </button>
      </div>
    </header>
  );
}
