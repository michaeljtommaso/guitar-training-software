// Unit tests for the license firewall decision logic (WP-0b / ADR-011).
// Run: node --test scripts/license-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression, checkPackage } from "./license-rules.mjs";

test("OR passes if any branch is allowlisted", () => {
  assert.equal(evaluateExpression("(MIT OR GPL-3.0)"), "allow");
  assert.equal(evaluateExpression("Apache-2.0 OR LGPL-3.0-or-later"), "allow");
  assert.equal(evaluateExpression("(GPL-3.0 OR AGPL-3.0)"), "deny"); // no allowed branch
});

test("AND fails if any branch is denylisted", () => {
  assert.equal(evaluateExpression("(MIT AND GPL-3.0)"), "deny");
  assert.equal(evaluateExpression("MIT AND Apache-2.0"), "allow");
  assert.equal(evaluateExpression("MIT AND SomeWeird-1.0"), "unknown"); // AND with unknown fails closed
});

test("unknown / missing / unparseable fails closed", () => {
  assert.equal(evaluateExpression("WTFPL"), "unknown");
  assert.equal(evaluateExpression("(((MIT OR"), "unknown"); // malformed
  assert.equal(checkPackage({ name: "x", version: "1", license: null }).ok, false);
  assert.equal(checkPackage({ name: "x", version: "1", license: "" }).ok, false);
  assert.equal(checkPackage({ name: "x", version: "1", license: "WTFPL" }).ok, false);
});

test("name denylist fails regardless of declared license", () => {
  assert.equal(checkPackage({ name: "essentia.js", version: "1", license: "MIT" }).ok, false);
  assert.equal(checkPackage({ name: "@scope/ultralytics-yolo", version: "1", license: "Apache-2.0" }).ok, false);
  assert.equal(checkPackage({ name: "madmom", version: "1", license: "MIT" }).ok, false);
  // and an exception can NOT un-ban a name-denylisted package
  assert.equal(
    checkPackage({ name: "essentia.js", version: "1", license: "MIT", exceptions: { "essentia.js@1": "nope" } }).ok,
    false,
  );
});

test("denylist family coverage", () => {
  for (const l of [
    "AGPL-3.0-only",
    "GPL-2.0-or-later",
    "GPL-2.0+",
    "LGPL-2.1",
    "SSPL-1.0",
    "CC-BY-NC-4.0",
    "CC-BY-NC-SA-4.0",
    "BUSL-1.1",
  ]) {
    assert.equal(evaluateExpression(l), "deny", l);
  }
});

test("allowlist coverage incl CC-BY, fonts, and dual", () => {
  for (const l of [
    "MIT",
    "Apache-2.0",
    "ISC",
    "BSD-3-Clause",
    "0BSD",
    "CC0-1.0",
    "OFL-1.1",
    "CC-BY-4.0",
    "Apache-2.0 WITH LLVM-exception",
    "(MIT OR CC0-1.0)",
  ]) {
    assert.equal(evaluateExpression(l), "allow", l);
  }
});
