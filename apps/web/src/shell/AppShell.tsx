// App shell (spec §5) — replaces App.tsx's body.
//
// Routes Wizard vs PracticeScreen from localStorage `gt-setup-done`, owns the
// theme state (default dark, persisted), the console-drawer open state, and —
// critically — the ONE CaptureHost (useCaptureHost.ts): both the wizard and
// the practice screen drive the same video element + CaptureHandles, so the
// live capture survives the Wizard → PracticeScreen transition without a
// stop/restart (spec §7 invariant).
//
// Key handling: the ConsoleDrawer owns the backtick/Escape listener itself
// (with the editable-target guard — T2 review fix); AppShell only owns the
// open boolean.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wizard } from "../wizard/Wizard";
import { PracticeScreen } from "./PracticeScreen";
import { TopBar } from "./TopBar";
import { HintBar } from "./HintBar";
import { TelemetryFooter } from "./TelemetryFooter";
import { ConsoleDrawer } from "./ConsoleDrawer";
import { ZoomPane } from "./ZoomPane";
import { useCaptureHost, type CaptureHost } from "./useCaptureHost";
import { useCaptureStore } from "../capture/captureStore";
import { useExploreStore, exploreHot } from "../explore/exploreStore";
import type { HeardState } from "../explore/feedback";
import { subscribeFusion, getFusionSnapshot, fusionHot } from "../fusion/fusionStore";
import { useToneStore } from "../tone/toneStore";
import { initTheme, setTheme, type Theme } from "../theme/theme";

const SETUP_DONE_KEY = "gt-setup-done";

function readSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Render-relevant signature of a HeardState (same discipline as
 *  ExplorePanel's sampler): the rAF loop only commits a setState when this
 *  changes, so audio-event-rate churn never re-renders the shell (ADR-002). */
function heardSig(h: HeardState): string {
  return `${h.chordHeard}|${h.strings?.join(",") ?? ""}|${h.scaleHitMidis?.join(",") ?? ""}`;
}

/** Sample exploreHot.heard once per animation frame while explore mode is
 *  live — mirrors ExplorePanel's own sampler for the strip that now renders
 *  in the ZoomPane slot (spec §8). */
function useExploreHeard(mode: "practice" | "explore"): HeardState {
  const [heard, setHeard] = useState<HeardState>(() => exploreHot.heard);
  const sigRef = useRef(heardSig(exploreHot.heard));
  useEffect(() => {
    if (mode !== "explore") return;
    let raf = requestAnimationFrame(function tick() {
      const h = exploreHot.heard;
      const sig = heardSig(h);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setHeard(h);
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  return heard;
}

/** The zoom-pane slot content (spec §5/§8): live crop when capture runs +
 *  calibrated; schematic fallback with the lesson target (practice) or the
 *  explore target + heard ticks (explore) otherwise. */
function ZoomPaneSlot({ capture }: { capture: CaptureHost }) {
  const mode = useExploreStore((s) => s.mode);
  const exploreTarget = useExploreStore((s) => s.target);
  // Re-render on lesson/step changes so fusionHot.target (updated
  // synchronously with each snapshot notify) is re-read below.
  useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const heard = useExploreHeard(mode);

  if (mode === "explore") {
    return <ZoomPane video={capture.videoEl} fallbackTarget={exploreTarget} heard={heard} />;
  }
  return <ZoomPane video={capture.videoEl} lessonTarget={fusionHot.target} />;
}

export function AppShell() {
  const [theme, setThemeState] = useState<Theme>(() => initTheme());
  const [setupDone, setSetupDone] = useState<boolean>(() => readSetupDone());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const capture = useCaptureHost();
  const tonePreset = useToneStore((s) => s.preset);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  const toggleConsole = () => setDrawerOpen((open) => !open);

  // Footer `setup wizard` link (spec §3/§9): the footer clears `gt-setup-done`
  // itself before calling this; entering the wizard closes the drawer (§9).
  const rerunWizard = () => {
    setDrawerOpen(false);
    setSetupDone(false);
  };

  // Drawer Inputs restart (T6): the host owns the video element, so capture
  // can (re)start from anywhere — on the CURRENT store selection, which the
  // drawer's own select() writes before invoking this.
  const restartCapture = () => {
    const { cameraId, micId } = useCaptureStore.getState();
    void capture.start(cameraId, micId);
  };

  // Footer tone segment (T2 handoff): only a live CaptureHandles carries the
  // tone-chain output latency — omitted (never faked) when capture is off.
  const toneLatencyMs =
    capture.handles && typeof capture.handles.tone?.latencyMs === "function"
      ? capture.handles.tone.latencyMs()
      : undefined;

  return (
    <main className="app-shell" data-testid="app-shell">
      {setupDone ? (
        <div data-testid="route-practice">
          <PracticeScreen
            capture={capture}
            topBar={
              <TopBar
                theme={theme}
                onToggleTheme={toggleTheme}
                consoleOpen={drawerOpen}
                onToggleConsole={toggleConsole}
              />
            }
            hintBar={<HintBar />}
            footer={
              <TelemetryFooter
                consoleOpen={drawerOpen}
                onToggleConsole={toggleConsole}
                onRerunWizard={rerunWizard}
                toneLatencyMs={toneLatencyMs}
                tonePresetLabel={tonePreset ?? undefined}
              />
            }
            zoomPane={<ZoomPaneSlot capture={capture} />}
          />
        </div>
      ) : (
        <div data-testid="route-wizard">
          <Wizard capture={capture} onDone={() => setSetupDone(true)} />
        </div>
      )}

      <ConsoleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        handles={capture.handles}
        onStopCapture={capture.stop}
        onRestartCapture={restartCapture}
      />
    </main>
  );
}
