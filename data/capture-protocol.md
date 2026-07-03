# Capture protocol (WP-6, §13 of the stack plan)

Staged protocol for building the proprietary multimodal dataset that unlocks markerless vision and the
learned models. Nothing in this document has been executed yet — no capture sessions exist as of this
build (see BLOCKERS). This is the plan a human runs.

## Stage 1 — controlled, scripted-error sessions

A handful of players (start with 2-3: builder + willing friends/family), indoor, consistent lighting.
Two camera angles per session where possible:

- **Front-on** — full torso + neck, for posture/strum-hand context.
- **Fretboard-side** — close on the fretting hand + neck, the primary annotation angle (matches the
  `NUM_STRINGS`/`MAX_FRET` window in `apps/web/src/perception/vision/fretboard.ts`: nut → fret 5).

For each of the **8 open chords** (`{C, G, D, A, E, Am, Em, Dm}` — the WP-2 template-match set), the
player performs:

1. **One clean rep** (target: `ok`) — correct fingering, clean strum, held ≥1.5 s.
2. **One deliberate mistake per taxonomy code**, called out loud before playing so the annotator's tag
   matches ground truth without guessing:
   - `wrong_fret` — fret one position off from the correct fret (e.g. C-major's index finger on fret 2
     instead of fret 1).
   - `wrong_string` — finger placed on the correct fret but the adjacent string.
   - `muted_string` — press too lightly / rest a neighboring finger on a string so it doesn't ring.
   - `behind_fret` — fret noticeably far from the fret wire (toward the middle of the fret cell or the
     wrong side), not buzzing but a clear technique flaw.
   - `missing_note` — skip a required fretting finger entirely (string rings open or not at all).
   - `late_strum` — deliberately delay the strum 200-400 ms after the chord is formed (timing mistake,
     not a fretting mistake).

That is 8 chords × 7 reps (1 clean + 6 mistakes) = 56 short clips per player per session at minimum.
Repeat for chord **transitions** (e.g. C→G, Am→Em — the pairs already in `data/lessons/drill-*.json`)
once the single-chord set is comfortable to label.

## Stage 2 — opt-in in-the-wild home sessions

Once Stage 1 proves the annotation tool and taxonomy hold up, invite opt-in home sessions from real
learners using the actual product capture flow (not a scripted protocol) — natural mistakes, natural
lighting/webcam setups, natural session length. Strictly opt-in, consent recorded per `ConsentSchema`
(`apps/annotation-tool/src/schemas/taxonomy.ts`) before any clip is used.

## Stage 3 — hard-negative mining

Once Stage 1+2 give a baseline, deliberately capture the failure modes that make markerless vision hard,
so the eventual detector doesn't collapse under them:

- **Low light** — dim room lighting, backlit subject.
- **Dark fretboards** — rosewood/ebony boards with low string/fret contrast.
- **Capo** — capo on frets 1-5, occluding fret markers and changing the effective nut position.
- **Fast-strum blur** — fast strumming-hand motion blur crossing the frame.
- **Occlusion** — thumb wraparound, other-hand shadow across the fretboard, sleeve/wristband over the
  wrist.

## Session checklist

Run through this before every capture session (controlled or in-the-wild):

- [ ] **Camera angle** set and framed (fretboard-side: full neck nut→fret 5 visible; front-on: full
      torso + neck visible).
- [ ] **Marker on** — the calibration marker/sticker set is attached at its documented fretboard
      position (MVP uses marker-based calibration per ADR-006; markerless is a later phase).
- [ ] **Tuner check** — guitar tuned (use the app's CREPE-based tuner step) immediately before
      recording; retune if a session runs long.
- [ ] **Consent form line** — verbal or written consent captured and logged:
      *"I consent to this video/audio being recorded and used for internal model training and
      evaluation at [scope]. I understand I can request deletion at any time."* Record `given`, `scope`,
      and `date` into the clip's `consent` block before the clip leaves the capture device.
- [ ] **Lighting/background** noted for hard-negative classification (normal / low-light / backlit).
- [ ] **Chord/mistake script** read out loud before each clip (Stage 1 only) so the label is
      unambiguous without re-watching.

## File naming convention

```
<sessionId>_<playerId>_<angle>_<chordOrPair>_<code>_<takeNumber>.<ext>
```

- `sessionId` — `YYYYMMDD-NN` (date + session index that day, e.g. `20260703-01`).
- `playerId` — short pseudonymous handle, not a real name (e.g. `p01`).
- `angle` — `front` | `fretside`.
- `chordOrPair` — one of the 8 chord labels, or `<chordA>-<chordB>` for a transition drill.
- `code` — one of the `DIAGNOSIS_CODES` (`apps/annotation-tool/src/shared/diagnosis.ts`), or `clean`
  for the deliberate `ok` rep.
- `takeNumber` — `01`, `02`, ... if a clip is re-shot.

Example: `20260703-01_p01_fretside_C_wrong_fret_01.mp4`. The annotation tool's `clipId` should match this
stem (extension dropped) so exported `taxonomy`/`jams`/`coco` files trace back to the source file
unambiguously.

## Status

**Not run.** This document is the protocol only; see `BLOCKERS.md` (owned by the orchestrator, not this
worktree) for the deferred verification-gate note. No real capture sessions, no real clips, and therefore
no internal labeled training set exist yet.
