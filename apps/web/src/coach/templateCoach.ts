// Client-side TEMPLATE FALLBACK COACH (§12.3) — teacher-authored explanation
// strings with slot filling for EVERY §9.1 Diagnosis code. Deterministic and
// dependency-free; it answers ENTIRELY on-device (the Local-only mode path,
// default ON) and is also the graceful-degradation path when the backend/model
// is unavailable.
//
// It mirrors services/backend/app/coach/templates.py (same strings, same slots)
// so the client and server degrade to identical advice. The taxonomy is reused
// from the fusion module (read-only) — coach never writes back into fusion.
import type { DiagnosisCode } from "../fusion";

export interface CoachDiagnosis {
  code: DiagnosisCode;
  /** standard string number 1 (high e) … 6 (low E), when known. */
  string?: number;
  conf?: number;
  severity?: number;
}

export interface CoachReply {
  code: DiagnosisCode;
  message: string;
  hedged: boolean;
  confidence: number;
  /** "template" (on-device) or "model" (validated backend turn). */
  source: "template" | "model";
  /** label of the source — "local" on-device, or the backend provider name. */
  provider: string;
}

// index 0..5 → string 1 (high e) .. string 6 (low E). Matches the server list
// and fusion's STRING_WORDS.
const STRING_WORDS = ["high e", "B", "G", "D", "A", "low E"] as const;

export function stringWord(string?: number): string | undefined {
  if (string === undefined || string < 1 || string > 6) return undefined;
  return STRING_WORDS[string - 1];
}

// Teacher-authored strings (kept in sync with templates.py).
const TEMPLATES: Record<DiagnosisCode, string> = {
  wrong_fret:
    "That finger looks off its target fret{sOn}. Line the tip up just behind the fret wire so the note rings cleanly.",
  wrong_string:
    "A finger is on the wrong string{sOn}. Check the chord diagram and move it onto the target string.",
  muted_string:
    "The {s} string is muted. Arch that finger so its pad clears the string, then let it ring.",
  behind_fret:
    "A finger is sitting too far behind its fret{sOn}. Slide it forward, right up against the fret, to stop the buzz.",
  missing_note:
    "The {s} string isn't sounding. Make sure it's fretted (or left open) and caught in your strum.",
  late_strum:
    "The chord change is landing late. Set the {chord} shape a beat early so the strum lands on time.",
  ok: "That's sounding clean — nice work. Hold the shape and keep the strum even.",
};

const GENERIC_STRING: Partial<Record<DiagnosisCode, string>> = {
  muted_string:
    "A string is muted. Arch the fretting fingers so each pad clears the neighbouring string.",
  missing_note:
    "A target note isn't sounding. Check each finger is fretting cleanly and included in the strum.",
};

/** Teacher-authored coaching line for one diagnosis, slot-filled. */
export function explain(code: DiagnosisCode, string?: number, chord?: string): string {
  const sw = stringWord(string);
  if (sw === undefined && GENERIC_STRING[code]) return GENERIC_STRING[code] as string;
  return (TEMPLATES[code] ?? TEMPLATES.ok)
    .replace("{s}", sw ?? "that")
    .replace("{sOn}", sw ? ` on the ${sw} string` : "")
    .replace("{chord}", chord ?? "next");
}

/** Highest-confidence non-ok diagnosis, else the first, else null (§9.3). */
export function primaryDiagnosis(diagnoses: CoachDiagnosis[]): CoachDiagnosis | null {
  const pool = diagnoses.filter((d) => d.code !== "ok");
  const list = pool.length ? pool : diagnoses;
  if (!list.length) return null;
  return list.reduce((a, b) =>
    (b.conf ?? 0) > (a.conf ?? 0) || ((b.conf ?? 0) === (a.conf ?? 0) && (b.severity ?? 0) > (a.severity ?? 0))
      ? b
      : a,
  );
}

/**
 * Answer a student LOCALLY from templates — zero network. Deterministic.
 * The template coach responds to the diagnoses (the free-text question is what
 * the model path uses; templates don't free-form), so it isn't a parameter here.
 */
export function answerLocally(diagnoses: CoachDiagnosis[], chord?: string): CoachReply {
  const primary = primaryDiagnosis(diagnoses);
  if (!primary) {
    return {
      code: "ok",
      message: explain("ok"),
      hedged: true,
      confidence: 0.5,
      source: "template",
      provider: "local",
    };
  }
  const confidence = primary.conf ?? 0.5;
  return {
    code: primary.code,
    message: explain(primary.code, primary.string, chord),
    hedged: confidence < 0.55,
    confidence,
    source: "template",
    provider: "local",
  };
}
