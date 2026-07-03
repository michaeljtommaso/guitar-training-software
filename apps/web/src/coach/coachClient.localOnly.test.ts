// LOCAL-ONLY-PROOF: with Local-only mode ON the coach must make ZERO network
// calls. We stub WebSocket and fetch and assert neither is touched.
import { afterEach, describe, expect, it, vi } from "vitest";
import { coachAnswer } from "./coachClient";

describe("Local-only mode makes zero network calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never constructs a WebSocket or calls fetch when localOnly is true", async () => {
    const wsCtor = vi.fn();
    class SpyWS {
      constructor() {
        wsCtor();
      }
      send() {}
      close() {}
    }
    const fetchSpy = vi.fn();
    vi.stubGlobal("WebSocket", SpyWS as unknown as typeof WebSocket);
    vi.stubGlobal("fetch", fetchSpy);

    const reply = await coachAnswer(
      { sessionId: "s", diagnoses: [{ code: "muted_string", string: 2, conf: 0.6 }], question: "why?" },
      { localOnly: true },
    );

    expect(wsCtor).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reply.source).toBe("template");
    expect(reply.provider).toBe("local");
    expect(reply.code).toBe("muted_string");
  });

  it("DOES attempt the socket when localOnly is off, and degrades gracefully", async () => {
    const wsCtor = vi.fn();
    // A socket that never opens → coachAnswer times out and falls back to templates.
    class DeadWS {
      onopen: (() => void) | null = null;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() {
        wsCtor();
      }
      send() {}
      close() {}
    }
    vi.stubGlobal("WebSocket", DeadWS as unknown as typeof WebSocket);

    const reply = await coachAnswer(
      { sessionId: "s", diagnoses: [], question: "x" },
      { localOnly: false, timeoutMs: 20 },
    );

    expect(wsCtor).toHaveBeenCalledTimes(1); // network WAS attempted
    expect(reply.provider).toBe("local-fallback"); // graceful degradation
  });
});
