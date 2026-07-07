// Theme mechanics (spec §1.4 / §4).
//
// v2 DEFAULTS TO DARK on first load (a deliberate change from the old
// light-default), and persists the user's choice in localStorage.gt-theme.
// Convention (matches index.css): light = NO data-theme attribute,
// dark = data-theme="dark" on <html>. The initial attribute is stamped by an
// inline script in index.html to avoid a first-paint flash; this module is the
// canonical runtime source used by the app shell and unit tests.

export type Theme = "dark" | "light";

const STORAGE_KEY = "gt-theme";

/** Resolve the theme to use at startup: saved preference, else dark default. */
export function resolveInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage unavailable (private mode / SSR) — fall through to default */
  }
  return "dark";
}

/** Reflect a theme onto <html> (light = no attribute). Does not persist. */
export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** Persist the chosen theme. */
export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* best-effort persistence */
  }
}

/** Apply the resolved initial theme (default dark). Call once at startup. */
export function initTheme(): Theme {
  const theme = resolveInitialTheme();
  applyTheme(theme);
  return theme;
}

/** Apply and persist a theme (used by the toggle). */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  persistTheme(theme);
}
