import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Token presence smoke (spec §10): both themes must define every semantic
// color token, and the light :root must define the structural tokens.
// jsdom's getComputedStyle does not resolve stylesheet-declared custom
// properties, so — like statusColors.test.ts — we parse tokens.css text and
// resolve var() chains ourselves.

const tokensPath = fileURLToPath(import.meta.url).replace(/tokens\.test\.ts$/, "tokens.css");
const css = readFileSync(tokensPath, "utf-8");

const DARK_SELECTOR = '[data-theme="dark"] {';
const darkStart = css.indexOf(DARK_SELECTOR);
const lightBlock = css.slice(0, darkStart);
const darkBlock = css.slice(darkStart);

/** Parse `--name: value;` declarations from a CSS block. */
function parseDecls(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(--[\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const lightDecls = parseDecls(lightBlock);
const darkDecls = parseDecls(darkBlock);

/** Resolve a token to a literal value, following var() indirection. */
function resolve(name: string, primary: Map<string, string>): string | undefined {
  // Layer-1 raw palette lives only in :root, so light decls are the fallback.
  const lookup = (n: string) => primary.get(n) ?? lightDecls.get(n);
  let value = lookup(name);
  let guard = 0;
  while (value && value.startsWith("var(") && guard++ < 10) {
    const inner = value.slice(4, value.lastIndexOf(")"));
    const refName = inner.split(",")[0].trim();
    const next = lookup(refName);
    if (next === undefined) break;
    value = next.trim();
  }
  return value;
}

// Color tokens that MUST resolve in both themes.
const THEME_COLOR_TOKENS = [
  "--bg",
  "--surface",
  "--surface-raised",
  "--border",
  "--text",
  "--text-muted",
  "--accent",
  "--accent-ink",
  "--ok",
  "--warn",
  "--danger",
  "--info",
  // perception status triad (canvas overlay) — theme-aware
  "--correct",
  "--error",
  "--uncertain",
];

// Structural tokens declared once on :root (theme-invariant).
const STRUCTURAL_TOKENS = [
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--sp-1",
  "--sp-2",
  "--sp-3",
  "--sp-4",
  "--sp-5",
  "--sp-6",
  "--font-ui",
  "--font-mono",
  "--pane-gap",
];

const NON_EMPTY = /\S/;

describe("tokens.css — token presence smoke (spec §10)", () => {
  it("has a distinct light (:root) and dark ([data-theme]) block", () => {
    expect(darkStart).toBeGreaterThan(0);
    expect(lightDecls.size).toBeGreaterThan(0);
    expect(darkDecls.size).toBeGreaterThan(0);
  });

  it.each(THEME_COLOR_TOKENS)("resolves %s non-empty in LIGHT", (token) => {
    const value = resolve(token, lightDecls);
    expect(value, `${token} unresolved in light`).toBeDefined();
    expect(value!).toMatch(NON_EMPTY);
  });

  it.each(THEME_COLOR_TOKENS)("resolves %s non-empty in DARK", (token) => {
    const value = resolve(token, darkDecls);
    expect(value, `${token} unresolved in dark`).toBeDefined();
    expect(value!).toMatch(NON_EMPTY);
  });

  it("declares every theme color token DIRECTLY in the dark block (no light bleed)", () => {
    for (const token of THEME_COLOR_TOKENS) {
      expect(darkDecls.has(token), `${token} not re-declared in [data-theme="dark"]`).toBe(true);
    }
  });

  it.each(STRUCTURAL_TOKENS)("declares structural token %s on :root", (token) => {
    const value = lightDecls.get(token);
    expect(value, `${token} missing from :root`).toBeDefined();
    expect(value!).toMatch(NON_EMPTY);
  });
});
