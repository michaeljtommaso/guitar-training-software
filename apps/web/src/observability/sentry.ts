// Privacy-first Sentry wiring (WP-7, §15). THREE hard rules, all unit-tested:
//   1. Sentry initialises ONLY when VITE_SENTRY_DSN is set. No DSN → no import,
//      no init, no network. Tonight there is no DSN, so the app runs with Sentry
//      fully dormant.
//   2. `scrubEvent` (the beforeSend) strips media/attachments, data: URLs,
//      device labels (camera/mic names), absolute user paths, and any breadcrumb
//      carrying a base64 blob — BEFORE anything leaves the device.
//   3. On-error Replay is MASKED: maskAllText + blockAllMedia, so no un-masked
//      biometric hand video / home audio can ever ride along.
//
// The SDK is dynamically imported so it never touches the initial bundle when
// no DSN is configured (it's a deferred on-demand vendor split, like opencv).

// ── the masked-replay contract (§15) ────────────────────────────────────────
// Asserted verbatim by a unit test — these two options ARE the "masked replay"
// guarantee. Session replay is off; only on-error replay ships, fully masked.
export const REPLAY_CONFIG = {
  maskAllText: true,
  blockAllMedia: true,
} as const;

// ── PII scrub (pure, unit-tested) ───────────────────────────────────────────

// Keys whose value is a device label / id and must never leave the device.
const REDACT_KEY = /(label|deviceid|groupid|camera|microphone|(^|_)mic(_|$))/i;

// Replacement patterns (global — used only with String.replace, never .test).
const DATA_URI_G = /data:[^\s"')]+/gi;
const WIN_USER_PATH_G = /[A-Za-z]:\\Users\\[^\s"')]*/gi;
const NIX_USER_PATH_G = /\/(?:home|Users)\/[^\s"')]*/g;
const BASE64_BLOB_G = /[A-Za-z0-9+/]{100,}={0,2}/g;

// Detection patterns (non-global — safe for .test).
const DATA_URI = /data:[^\s"')]+/i;
const BASE64_BLOB = /[A-Za-z0-9+/]{100,}={0,2}/;

/** Redact data: URLs, absolute user paths, and inline base64 blobs from a string. */
export function redactString(s: string): string {
  return s
    .replace(DATA_URI_G, "[data-uri]")
    .replace(WIN_USER_PATH_G, "[user-path]")
    .replace(NIX_USER_PATH_G, "[user-path]")
    .replace(BASE64_BLOB_G, "[base64-redacted]");
}

/** True if the (possibly nested) value carries a base64 blob or data: URI. */
function carriesBlob(v: unknown): boolean {
  const s = typeof v === "string" ? v : safeStringify(v);
  return BASE64_BLOB.test(s) || DATA_URI.test(s);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(v);
  }
}

function scrubBreadcrumbs(v: unknown): unknown {
  // Sentry uses either a bare array or `{ values: [...] }`. Drop any crumb
  // carrying a base64 blob / data: URI outright; scrub the survivors.
  if (Array.isArray(v)) return v.filter((c) => !carriesBlob(c)).map((c) => scrub(c));
  if (v && typeof v === "object" && Array.isArray((v as { values?: unknown[] }).values)) {
    const values = (v as { values: unknown[] }).values;
    return { ...(v as object), values: values.filter((c) => !carriesBlob(c)).map((c) => scrub(c)) };
  }
  return scrub(v);
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/^attachments?$/i.test(k)) continue; // drop attachment/media wholesale
      if (k === "breadcrumbs") {
        out[k] = scrubBreadcrumbs(v);
        continue;
      }
      if (REDACT_KEY.test(k)) {
        out[k] = "[redacted-device]"; // camera/mic label or device id
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

/**
 * beforeSend: return a scrubbed CLONE of the event, or null to drop it. Pure —
 * no I/O, no mutation of the input. This is the last gate before anything is
 * sent, so it fails safe: unknown structure is walked generically and scrubbed.
 */
export function scrubEvent<T>(event: T): T {
  return scrub(event) as T;
}

// ── DSN-gated init + error capture ──────────────────────────────────────────

type SentryApi = typeof import("@sentry/react");
let api: SentryApi | null = null;
let enabled = false;

/** The DSN, or undefined tonight (absent → Sentry stays fully dormant). */
export function sentryDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim() !== "" ? dsn : undefined;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Initialise Sentry — ONLY when a DSN is present. Without a DSN this is a no-op
 * that imports nothing and opens no network connection (the tonight case).
 * Returns whether Sentry was enabled.
 */
export async function initSentry(dsn = sentryDsn()): Promise<boolean> {
  if (!dsn) return false; // no DSN → dormant. No import, no init, no network.
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    beforeSend: (event) => scrubEvent(event),
    // On-error replay only; session replay OFF. The replay itself is masked.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.replayIntegration(REPLAY_CONFIG)],
  });
  api = Sentry;
  enabled = true;
  return true;
}

// Last report the ErrorBoundary produced — for the no-leak unit test to inspect.
let lastReport: unknown = null;
export function _lastErrorReportForTest(): unknown {
  return lastReport;
}

/**
 * Capture a React render error. The report contains the error + component stack
 * ONLY — never props, state, or DOM snapshots (a plain ErrorBoundary's
 * componentDidCatch never receives them). We scrub it regardless so the no-leak
 * contract holds even with Sentry dormant, then forward to Sentry if enabled.
 */
export function captureComponentError(error: Error, componentStack: string): void {
  lastReport = scrubEvent({
    exception: { name: error.name, message: error.message, stack: error.stack },
    componentStack,
  });
  if (enabled && api) {
    api.captureException(error, { contexts: { react: { componentStack } } });
  }
}
