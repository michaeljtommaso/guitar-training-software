// App shell (spec §5) — replaces App.tsx's body.
//
// Wave A scaffold: routes Wizard vs PracticeScreen from localStorage
// `gt-setup-done`, owns the theme toggle (default dark, persisted), and holds
// the console-drawer open state + backtick/Escape key handler. The drawer
// itself and the real TopBar/PracticeScreen chrome are Wave B/C — for now BOTH
// routes render the EXISTING SetupWizard + CoachPanel so the app stays fully
// functional and every existing test/e2e keeps passing.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { SetupWizard } from "../capture/SetupWizard";
import { CoachPanel } from "../coach";
import { initTheme, setTheme, type Theme } from "../theme/theme";

const SETUP_DONE_KEY = "gt-setup-done";

function readSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "true";
  } catch {
    return false;
  }
}

/** The existing app body, shared by both routes until Wave B/C split it. */
function LegacyBody() {
  return (
    <>
      <SetupWizard />
      <CoachPanel />
    </>
  );
}

export function AppShell() {
  const [theme, setThemeState] = useState<Theme>(() => initTheme());
  const [setupDone] = useState<boolean>(() => readSetupDone());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDark = theme === "dark";

  const toggleTheme = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  // Global console-drawer key handler (spec §5): backtick toggles, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`") {
        e.preventDefault();
        setDrawerOpen((open) => !open);
      } else if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="app-shell" data-testid="app-shell">
      <h1>Guitar tutor</h1>
      <button type="button" className="theme-toggle" onClick={toggleTheme}>
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </button>

      {setupDone ? (
        <div data-testid="route-practice">
          <LegacyBody />
        </div>
      ) : (
        <div data-testid="route-wizard">
          <LegacyBody />
        </div>
      )}

      {/* ConsoleDrawer mount point (Wave B). Only the open state exists today. */}
      <div data-testid="console-drawer-mount" data-open={drawerOpen} hidden />
    </main>
  );
}
