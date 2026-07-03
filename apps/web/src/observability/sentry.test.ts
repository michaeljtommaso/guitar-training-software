import { describe, expect, it } from "vitest";
import {
  REPLAY_CONFIG,
  redactString,
  scrubEvent,
  initSentry,
  isSentryEnabled,
  captureComponentError,
  _lastErrorReportForTest,
} from "./sentry";

const BASE64 = "A".repeat(140) + "=="; // a base64-looking blob

describe("masked-replay contract (§15)", () => {
  it("asserts the exact masked-replay options", () => {
    // These two ARE the "masked replay" guarantee — do not weaken.
    expect(REPLAY_CONFIG.maskAllText).toBe(true);
    expect(REPLAY_CONFIG.blockAllMedia).toBe(true);
  });
});

describe("redactString", () => {
  it("strips data: URLs", () => {
    expect(redactString("img data:image/png;base64,AAAA end")).toBe("img [data-uri] end");
  });
  it("redacts Windows absolute user paths", () => {
    expect(redactString("at C:\\Users\\Mikey\\app\\x.ts:1")).toBe("at [user-path]");
  });
  it("redacts unix absolute user paths", () => {
    expect(redactString("at /home/mikey/app/x.ts")).toBe("at [user-path]");
    expect(redactString("at /Users/mikey/app/x.ts")).toBe("at [user-path]");
  });
  it("redacts inline base64 blobs", () => {
    expect(redactString(`payload=${BASE64}`)).toBe("payload=[base64-redacted]");
  });
});

describe("scrubEvent (beforeSend)", () => {
  it("drops attachments/media wholesale", () => {
    const out = scrubEvent({ attachments: [{ data: BASE64 }], message: "ok" }) as Record<string, unknown>;
    expect(out.attachments).toBeUndefined();
    expect(out.message).toBe("ok");
  });

  it("redacts device labels (camera/mic names) by key", () => {
    const out = scrubEvent({
      extra: { cameraLabel: "FaceTime HD Camera", micLabel: "Blue Yeti", deviceId: "abc123", other: "keep" },
    }) as { extra: Record<string, unknown> };
    expect(out.extra.cameraLabel).toBe("[redacted-device]");
    expect(out.extra.micLabel).toBe("[redacted-device]");
    expect(out.extra.deviceId).toBe("[redacted-device]");
    expect(out.extra.other).toBe("keep");
  });

  it("strips data: URLs and user paths in nested strings", () => {
    const out = scrubEvent({
      exception: { stack: "at C:\\Users\\Mikey\\a.ts", value: "data:image/png;base64,AAAA" },
    }) as { exception: Record<string, string> };
    expect(out.exception.stack).toBe("at [user-path]");
    expect(out.exception.value).toBe("[data-uri]");
  });

  it("drops breadcrumbs carrying base64 blobs (both array and .values shapes)", () => {
    const bare = scrubEvent({
      breadcrumbs: [{ message: "click" }, { message: `frame ${BASE64}` }],
    }) as { breadcrumbs: unknown[] };
    expect(bare.breadcrumbs).toHaveLength(1);

    const wrapped = scrubEvent({
      breadcrumbs: { values: [{ message: "nav" }, { data: { blob: BASE64 } }] },
    }) as { breadcrumbs: { values: unknown[] } };
    expect(wrapped.breadcrumbs.values).toHaveLength(1);
  });

  it("does not mutate the input event", () => {
    const input = { extra: { cameraLabel: "X" } };
    scrubEvent(input);
    expect(input.extra.cameraLabel).toBe("X");
  });
});

describe("DSN gating — no DSN → fully dormant", () => {
  it("initSentry() without a DSN does nothing and stays disabled", async () => {
    const on = await initSentry(undefined); // tonight's case: no DSN
    expect(on).toBe(false);
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureComponentError still scrubs locally while dormant (no network)", () => {
    // No DSN configured, so this must not throw and must not open a connection;
    // it only records a scrubbed local report.
    const err = new Error("boom C:\\Users\\Mikey\\secret.ts");
    captureComponentError(err, "at Comp");
    const report = _lastErrorReportForTest() as { exception: { message: string } };
    expect(report.exception.message).toBe("boom [user-path]");
    expect(isSentryEnabled()).toBe(false);
  });
});
