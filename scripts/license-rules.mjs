// SPDX license decision logic for the WP-0b license firewall (ADR-011).
// Pure, dependency-free, and unit-tested — this is the pass/fail brain the
// gate (check-licenses.mjs) imports. Fail-closed: anything not provably
// allowed is rejected.
//
// Three-valued verdicts: "allow" | "deny" | "unknown". Only "allow" ships.

// Allowlist — exact SPDX ids (case-insensitive; a trailing "+" is stripped
// before matching). Kept lowercased for comparison.
const ALLOW = new Set([
  "mit",
  "apache-2.0",
  "isc",
  "bsd-2-clause",
  "bsd-3-clause",
  "0bsd",
  "cc0-1.0",
  "unlicense",
  "ofl-1.1",
  "blueoak-1.0.0",
  "python-2.0",
  "zlib",
  "cc-by-3.0",
  "cc-by-4.0",
]);

// Denylist — copyleft / non-commercial / source-available families that must
// never reach the shipped client bundle. Tested against the raw token.
const DENY_PATTERNS = [
  /^AGPL/i, // AGPL-3.0, AGPL-3.0-only, AGPL-3.0-or-later, …
  /^GPL/i, // GPL-2.0, GPL-3.0-only, GPL-2.0+, …
  /^LGPL/i, // LGPL-2.1, LGPL-3.0-or-later, …
  /^SSPL/i, // SSPL-1.0 (MongoDB)
  /^CC-BY-NC/i, // CC-BY-NC, CC-BY-NC-SA, CC-BY-NC-ND (non-commercial)
  /(^|-)NC(-|$)/i, // any other "NC" non-commercial variant
  /^BUSL/i, // BUSL-1.1 (Business Source License)
];

// Package-name denylist — these fail regardless of the license they declare
// (ADR-011: Essentia.js AGPLv3, Ultralytics AGPL-3.0, Madmom CC BY-NC-SA are
// offline-experiment-only and must never be shipped, even if a fork relabels
// its license field). Substring match, case-insensitive.
const NAME_DENY_PATTERNS = [/essentia\.js/i, /ultralytics/i, /madmom/i];

export function nameDenied(name) {
  return NAME_DENY_PATTERNS.some((re) => re.test(name));
}

// Classify a single SPDX license token (a leaf of the expression).
export function classifyLeaf(token) {
  const t = String(token).trim();
  if (t === "") return "unknown";
  for (const re of DENY_PATTERNS) if (re.test(t)) return "deny";
  const norm = t.replace(/\+$/, "").toLowerCase(); // "Apache-2.0+" -> "apache-2.0"
  if (ALLOW.has(norm)) return "allow";
  return "unknown";
}

// --- SPDX expression parser (recursive descent) ---------------------------
// Grammar (AND binds tighter than OR, per SPDX):
//   expr   := term  (OR term)*
//   term   := factor (AND factor)*
//   factor := IDENT (WITH IDENT)? | '(' expr ')'
// Handles arbitrary nesting (spec only requires one level).

function tokenize(expr) {
  const tokens = [];
  const s = String(expr);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push(c);
      i++;
      continue;
    }
    let j = i;
    while (j < s.length && !" \t\n\r()".includes(s[j])) j++;
    tokens.push(s.slice(i, j));
    i = j;
  }
  return tokens;
}

const isKeyword = (tok, kw) => typeof tok === "string" && tok.toUpperCase() === kw;

function combineOr(a, b) {
  if (a === "allow" || b === "allow") return "allow";
  if (a === "deny" || b === "deny") return "deny";
  return "unknown";
}

function combineAnd(a, b) {
  if (a === "deny" || b === "deny") return "deny";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "allow";
}

// Evaluate an SPDX expression to "allow" | "deny" | "unknown".
// Any malformed / unparseable input fails closed as "unknown".
export function evaluateExpression(expr) {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];

  function parseFactor() {
    const tok = peek();
    if (tok === undefined) throw new Error("unexpected end of expression");
    if (tok === "(") {
      pos++; // consume '('
      const v = parseExpr();
      if (peek() !== ")") throw new Error("missing closing paren");
      pos++; // consume ')'
      return v;
    }
    if (tok === ")" || isKeyword(tok, "AND") || isKeyword(tok, "OR") || isKeyword(tok, "WITH")) {
      throw new Error(`unexpected token ${tok}`);
    }
    pos++; // consume IDENT (the license)
    if (isKeyword(peek(), "WITH")) {
      pos++; // consume WITH
      if (peek() === undefined) throw new Error("dangling WITH");
      pos++; // consume the exception id (ignored for classification)
    }
    return classifyLeaf(tok);
  }

  function parseTerm() {
    let v = parseFactor();
    while (isKeyword(peek(), "AND")) {
      pos++;
      v = combineAnd(v, parseFactor());
    }
    return v;
  }

  function parseExpr() {
    let v = parseTerm();
    while (isKeyword(peek(), "OR")) {
      pos++;
      v = combineOr(v, parseTerm());
    }
    return v;
  }

  try {
    if (tokens.length === 0) return "unknown";
    const v = parseExpr();
    if (pos !== tokens.length) return "unknown"; // trailing garbage
    return v;
  } catch {
    return "unknown";
  }
}

// The full per-package decision. `exceptions` is a { "name@version": "reason" }
// map of explicitly reviewed overrides for the fail-closed unknown case.
// Name-denylist wins over everything (an exception can never un-ban Essentia
// et al); it also wins over the declared license.
export function checkPackage({ name, version, license, exceptions = {} }) {
  const id = `${name}@${version}`;
  if (nameDenied(name)) {
    return { ok: false, id, license: license ?? null, reason: "name-denylisted (ADR-011 never-ship)" };
  }
  if (Object.prototype.hasOwnProperty.call(exceptions, id)) {
    return { ok: true, id, license: license ?? null, reason: `reviewed exception: ${exceptions[id]}` };
  }
  if (license == null || String(license).trim() === "") {
    return { ok: false, id, license: null, reason: "missing license (fail-closed)" };
  }
  const verdict = evaluateExpression(license);
  if (verdict === "allow") return { ok: true, id, license, reason: "allowed" };
  return {
    ok: false,
    id,
    license,
    reason: verdict === "deny" ? "denylisted license" : "unknown/unparseable license (fail-closed)",
  };
}
