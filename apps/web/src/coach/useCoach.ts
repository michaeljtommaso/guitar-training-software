// Coach panel logic (WP-5), extracted from CoachPanel.tsx (spec v2-ui §5) so
// the legacy CoachPanel and the v2 CoachColumn render byte-identical behavior
// from ONE source of truth — the slow-path fusion read + coachAnswer() call,
// local-only toggle, and reply/source formatting never diverge between the
// two chrome skins.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DiagnosisCode } from "../fusion";
import { getFusionSnapshot, subscribeFusion } from "../fusion/fusionStore";
import { coachAnswer } from "./coachClient";
import { useCoachStore } from "./coachStore";
import type { CoachDiagnosis, CoachReply } from "./templateCoach";

export const CODE_LABELS: Record<DiagnosisCode, string> = {
  wrong_fret: "wrong fret",
  wrong_string: "wrong string",
  muted_string: "muted string",
  behind_fret: "finger behind the fret",
  missing_note: "missing note",
  late_strum: "late strum",
  ok: "sounding good",
};

function newSessionId(): string {
  const c = globalThis.crypto;
  return c && "randomUUID" in c ? c.randomUUID() : `sess-${Date.now()}`;
}

export interface UseCoach {
  localOnly: boolean;
  toggleLocalOnly(): void;
  summary: string;
  question: string;
  setQuestion(v: string): void;
  streaming: string;
  reply: CoachReply | null;
  busy: boolean;
  ask(): Promise<void>;
  sourceLabel: string;
}

export function useCoach(): UseCoach {
  const snap = useSyncExternalStore(subscribeFusion, getFusionSnapshot);
  const localOnly = useCoachStore((s) => s.localOnly);
  const toggleLocalOnly = useCoachStore((s) => s.toggleLocalOnly);
  const hydrate = useCoachStore((s) => s.hydrate);

  const sessionId = useRef(newSessionId()).current;
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState("");
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const last = snap.lastDiagnosis;
  const summary = last
    ? `Last: ${CODE_LABELS[last.code]} (${Math.round(last.conf * 100)}% conf) on ${snap.targetChord ?? "—"}`
    : "Play a chord to get feedback, then ask the coach about it.";

  async function ask() {
    setBusy(true);
    setStreaming("");
    setReply(null);
    const diagnoses: CoachDiagnosis[] = last
      ? [{ code: last.code, conf: last.conf, severity: last.severity }]
      : [];
    const result = await coachAnswer(
      {
        sessionId,
        targetChord: snap.targetChord ?? undefined,
        lessonId: snap.lessonId ?? undefined,
        diagnoses,
        question,
      },
      { localOnly, onDelta: (t) => setStreaming((s) => s + t) },
    );
    setReply(result);
    setBusy(false);
  }

  const sourceLabel = reply
    ? reply.source === "model"
      ? `Model reply (${reply.provider})`
      : reply.provider === "local"
        ? "On-device coach"
        : "On-device coach (backend unavailable)"
    : "";

  return { localOnly, toggleLocalOnly, summary, question, setQuestion, streaming, reply, busy, ask, sourceLabel };
}
