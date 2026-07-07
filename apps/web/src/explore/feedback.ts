// Explore listening feedback. AUDIO ONLY, and deliberately dumb: no diagnoses,
// no hints, no negative judgments — we mark what was HEARD, never what was
// wrong (spec §6). Pure core (ExploreFeedback) + a module singleton wired to
// the capture controller's audio-event forwarding.
//
// Event shapes are the REAL §9.1 AudioEvent union (fusion/events/audioEvents.ts):
//   chord: { t; kind:"chord"; label; conf }
//   notes: { t; kind:"notes"; pitches: number[]; conf }   ← MIDI numbers, flat.
// The notes leg (Basic Pitch worker) and the chord leg (DSP audio worker) reach
// this module through two separate controller taps; both funnel into ingest().
import { STANDARD_TUNING_MIDI } from "../theory/notes";
import { exploreHot, useExploreStore, currentResolvedTier, type ExploreTarget } from "./exploreStore";

/** Min chord-classifier confidence for the light-tier "heard it" glow. Phase-0
 *  value; tune on hardware like SILENCE_RMS. */
export const LIGHT_CONF = 0.5;
/** How long a hit stays lit (ms). */
export const HOLD_MS = 1500;
/** Full-tier note match tolerance (semitones). */
export const SEMITONE_TOL = 1;

export interface HeardState {
  chordHeard: boolean;
  strings?: Array<"ok" | "pending" | "muted-expected">;
}

/** The 8-template label the audio leg emits for a chord we can listen for, or
 *  null when the classifier can't know this chord (spec §6 honesty rule). */
export function listenableLabel(root: string, suffix: string): string | null {
  const map: Record<string, string> = { major: "", minor: "m" };
  if (!(suffix in map)) return null;
  const label = `${root}${map[suffix]}`;
  const TEMPLATE_LABELS = ["C", "A", "G", "E", "D", "Am", "Em", "Dm"]; // WP-2 open set
  return TEMPLATE_LABELS.includes(label) ? label : null;
}

export class ExploreFeedback {
  private chordHit: { label: string; t: number } | null = null;
  private noteHits = new Map<number, number>(); // midi → last-heard tMs

  ingest(events: unknown[], tMs: number): void {
    for (const e of events as Array<Record<string, unknown>>) {
      if (!e || typeof e !== "object") continue;
      if (e.kind === "chord" && typeof e.label === "string" && typeof e.conf === "number") {
        if (e.conf >= LIGHT_CONF) this.chordHit = { label: e.label, t: tMs };
      }
      if (e.kind === "notes" && Array.isArray(e.pitches)) {
        for (const p of e.pitches as unknown[]) {
          if (typeof p === "number") this.noteHits.set(Math.round(p), tMs);
        }
      }
    }
  }

  heard(target: ExploreTarget, tier: "light" | "full", tMs: number): HeardState {
    if (!target) return { chordHeard: false };
    const chordHeard = this.chordHeardFor(target, tMs);
    if (tier === "light" || target.kind !== "chord") return { chordHeard };
    const v = target.voicings[target.active];
    if (!v) return { chordHeard };
    const strings = v.frets.map((fret, i) => {
      if (fret < 0) return "muted-expected" as const;
      const expected = STANDARD_TUNING_MIDI[i] + fret;
      for (let m = expected - SEMITONE_TOL; m <= expected + SEMITONE_TOL; m++) {
        const at = this.noteHits.get(m);
        if (at !== undefined && tMs - at <= HOLD_MS) return "ok" as const;
      }
      return "pending" as const;
    });
    return { chordHeard, strings };
  }

  private chordHeardFor(target: NonNullable<ExploreTarget>, tMs: number): boolean {
    if (!this.chordHit || tMs - this.chordHit.t > HOLD_MS) return false;
    if (target.kind !== "chord") return false;
    const want = listenableLabel(target.root, target.suffix);
    return want !== null && this.chordHit.label === want;
  }
}

const singleton = new ExploreFeedback();

/** Called by capture/controller.ts wherever it forwards audio events to fusion.
 *  No-op outside explore mode — the controller stays dumb. */
export function exploreIngest(events: unknown[]): void {
  if (useExploreStore.getState().mode !== "explore") return;
  const tMs = performance.now();
  singleton.ingest(events, tMs);
  exploreHot.heard = singleton.heard(exploreHot.target, currentResolvedTier(), tMs);
}
