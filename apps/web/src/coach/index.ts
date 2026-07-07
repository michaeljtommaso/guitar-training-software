// Slow-path coaching client + on-device template fallback (WP-5).
//
// The coach is the SLOW PATH only: it reads fusion diagnoses and produces
// natural-language / structured coaching, but is structurally unable to mutate
// the fast-path R/Y/G state — nothing under src/fusion, src/overlay, or
// src/perception imports from here (enforced by isolation.test.ts).
export { coachAnswer, type CoachTurnInput, type CoachAnswerOptions } from "./coachClient";
export { useCoachStore, type CoachStore } from "./coachStore";
export {
  answerLocally,
  explain,
  primaryDiagnosis,
  stringWord,
  type CoachDiagnosis,
  type CoachReply,
} from "./templateCoach";
