import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./theme/tokens.css";
import "./index.css";
import App from "./App";
import { initTheme } from "./theme/theme";
import { ErrorBoundary } from "./observability/ErrorBoundary";
import { initSentry } from "./observability/sentry";

// Resolve + apply the theme before first render (default dark, spec §1.4).
// The inline script in index.html already stamps the attribute to avoid a
// flash; this keeps the runtime canonical and covers the preview/build path.
initTheme();

// DSN-gated: a no-op (no import, no network) unless VITE_SENTRY_DSN is set.
void initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
