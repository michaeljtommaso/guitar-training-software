// Slow-path coaching client. `coachAnswer` is the single entry point the UI
// calls; it enforces the privacy contract:
//
//   localOnly === true  → answer ENTIRELY on-device from templates. It never
//                         constructs a WebSocket or calls fetch. (Enforced and
//                         test-asserted in coachClient.local-only.test.ts.)
//   localOnly === false → stream from /ws/coach, with GRACEFUL DEGRADATION to
//                         the template coach if the backend/model is unavailable.
//
// The coach only ever READS fusion outputs (diagnoses) — it can never mutate the
// fast-path R/Y/G state (enforced by isolation.test.ts).
import { answerLocally, type CoachDiagnosis, type CoachReply } from "./templateCoach";

export interface CoachTurnInput {
  sessionId: string;
  targetChord?: string;
  lessonId?: string;
  diagnoses: CoachDiagnosis[];
  question: string;
  /** opt-in — keyframes/clip only leave the device when true. */
  consent?: boolean;
  keyframes?: string[];
}

export interface CoachAnswerOptions {
  localOnly: boolean;
  onDelta?: (text: string) => void;
  /** override the WS URL (tests / non-default deploys). */
  url?: string;
  /** ms before giving up on the socket and degrading to templates. */
  timeoutMs?: number;
}

function defaultWsUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return env?.VITE_COACH_WS_URL ?? "ws://localhost:8000/ws/coach";
}

/**
 * Orchestrated coach answer. When `localOnly` is true this returns immediately
 * from templates and touches NO network API.
 */
export async function coachAnswer(
  input: CoachTurnInput,
  opts: CoachAnswerOptions,
): Promise<CoachReply> {
  if (opts.localOnly) {
    return answerLocally(input.diagnoses, input.targetChord);
  }
  try {
    return await streamCoach(input, opts.url ?? defaultWsUrl(), opts.onDelta, opts.timeoutMs ?? 8000);
  } catch {
    // Backend/model unavailable → degrade to the on-device template coach.
    const local = answerLocally(input.diagnoses, input.targetChord);
    return { ...local, provider: "local-fallback" };
  }
}

/** Open a WS to /ws/coach, send one conversational turn, resolve on `final`. */
function streamCoach(
  input: CoachTurnInput,
  url: string,
  onDelta: ((text: string) => void) | undefined,
  timeoutMs: number,
): Promise<CoachReply> {
  return new Promise<CoachReply>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => fail(new Error("coach timeout")), timeoutMs);

    function done(): void {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    function fail(err: Error): void {
      if (settled) return;
      settled = true;
      done();
      reject(err);
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          mode: "conversational",
          session_id: input.sessionId,
          target_chord: input.targetChord,
          lesson_id: input.lessonId,
          consent: input.consent ?? false,
          question: input.question,
          recent_diagnoses: input.diagnoses.map((d) => ({
            code: d.code,
            string: d.string,
            conf: d.conf ?? 0,
            severity: d.severity ?? 0,
          })),
          keyframes: input.consent ? (input.keyframes ?? []) : [],
        }),
      );
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === "delta" && typeof msg.text === "string") {
        onDelta?.(msg.text);
      } else if (msg.type === "final") {
        const data = (msg.data ?? {}) as { code?: string; message?: string; confidence?: number; hedged?: boolean };
        if (settled) return;
        settled = true;
        done();
        resolve({
          code: (data.code as CoachReply["code"]) ?? "ok",
          message: data.message ?? "",
          confidence: data.confidence ?? 0.5,
          hedged: data.hedged ?? false,
          source: msg.source === "model" ? "model" : "template",
          provider: typeof msg.provider === "string" ? msg.provider : "backend",
        });
      } else if (msg.type === "error") {
        fail(new Error(String(msg.reason ?? "coach error")));
      }
    };

    ws.onerror = () => fail(new Error("coach socket error"));
    ws.onclose = () => fail(new Error("coach socket closed"));
  });
}
