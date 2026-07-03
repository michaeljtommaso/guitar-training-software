# Server-side TEMPLATE FALLBACK COACH (§12.3). Teacher-authored explanation
# strings with slot filling for EVERY §9.1 Diagnosis code. Fully deterministic
# and dependency-free: it is what serves when the model/network is unavailable,
# when the budget kill-switch trips, or when model output fails validation.
#
# It mirrors apps/web/src/coach/templateCoach.ts (same strings, same slots) so
# the local-only client and the server degrade to identical advice.
from __future__ import annotations

from typing import Optional

from ..content import chord_by_name
from ..schemas import (
    AmbiguityResolution,
    ConversationalTurn,
    CoachRequest,
    DiagnosisIn,
    GeneratedDrill,
    Hypothesis,
    SessionSummary,
)

# Standard numbering: index 0..5 → string 1 (high e) .. string 6 (low E).
STRING_WORDS = ["high e", "B", "G", "D", "A", "low E"]


def string_word(string: Optional[int]) -> Optional[str]:
    if string is None or not (1 <= string <= 6):
        return None
    return STRING_WORDS[string - 1]


# Teacher-authored strings. {s} = "the <name> string"; {chord} = target chord.
_TEMPLATES = {
    "wrong_fret": "That finger looks off its target fret{s_on}. Line the tip up just behind the fret wire so the note rings cleanly.",
    "wrong_string": "A finger is on the wrong string{s_on}. Check the chord diagram and move it onto the target string.",
    "muted_string": "The {s} string is muted. Arch that finger so its pad clears the string, then let it ring.",
    "behind_fret": "A finger is sitting too far behind its fret{s_on}. Slide it forward, right up against the fret, to stop the buzz.",
    "missing_note": "The {s} string isn't sounding. Make sure it's fretted (or left open) and caught in your strum.",
    "late_strum": "The chord change is landing late. Set the {chord} shape a beat early so the strum lands on time.",
    "ok": "That's sounding clean — nice work. Hold the shape and keep the strum even.",
}

_GENERIC_STRING = {
    "muted_string": "A string is muted. Arch the fretting fingers so each pad clears the neighbouring string.",
    "missing_note": "A target note isn't sounding. Check each finger is fretting cleanly and included in the strum.",
}


def explain(code: str, string: Optional[int] = None, chord: Optional[str] = None) -> str:
    """The teacher-authored coaching line for one diagnosis, slot-filled."""
    sw = string_word(string)
    if sw is None and code in _GENERIC_STRING:
        return _GENERIC_STRING[code]
    template = _TEMPLATES.get(code, _TEMPLATES["ok"])
    return template.format(
        s=sw or "that",
        s_on=f" on the {sw} string" if sw else "",
        chord=chord or "next",
    )


def _primary(diagnoses: list[DiagnosisIn]) -> Optional[DiagnosisIn]:
    """Highest-confidence non-ok diagnosis, else the first, else None (§9.3)."""
    non_ok = [d for d in diagnoses if d.code != "ok"]
    pool = non_ok or diagnoses
    if not pool:
        return None
    return max(pool, key=lambda d: (d.conf, d.severity))


def _fallback_drill(req: CoachRequest) -> GeneratedDrill:
    """A minimal but SCHEMA-VALID practice drill built from the chord library —
    a hold-and-repeat step on the target chord, prioritising the observed miss."""
    chord_name = req.target_chord or "C"
    chord = chord_by_name(chord_name) or chord_by_name("C")
    fingers = (chord or {}).get("fingers", [{"finger": "index", "string": 2, "fret": 1}])
    fingering = {f["finger"]: {"string": f["string"], "fret": f["fret"]} for f in fingers}
    fretted = {f["string"] for f in fingers}
    muted = set((chord or {}).get("mutedStrings", []))
    expected = sorted(s for s in range(1, 7) if s not in muted) or [1]
    primary = _primary(req.recent_diagnoses)
    priority = [primary.code] if primary and primary.code != "ok" else ["muted_string"]
    return GeneratedDrill(
        id=f"drill_template_{chord_name.lower()}",
        title=f"{chord_name} hold-and-ring drill",
        steps=[
            {
                "chord": chord_name,
                "accepted_fingerings": [fingering],
                "expected_strings": expected,
                "avoid_strings": sorted(muted),
                "success_criteria": {
                    "hold_time_ms": 1200,
                    "min_audio_conf": 0.6,
                    "max_muted_strings": 0,
                },
                "feedback_priority": priority,
            }
        ],
    )


def fallback_output(req: CoachRequest):
    """Deterministic per-mode structured fallback, in the SAME shape a validated
    model turn would produce, so the client renders both identically."""
    diagnoses = req.recent_diagnoses
    primary = _primary(diagnoses)

    if req.mode == "conversational":
        if primary is None:
            return ConversationalTurn(
                code="ok", message=explain("ok"), confidence=0.5, hedged=True
            )
        return ConversationalTurn(
            code=primary.code,
            message=explain(primary.code, primary.string, req.target_chord),
            confidence=primary.conf or 0.5,
            hedged=(primary.conf or 0.5) < 0.55,
        )

    if req.mode == "ambiguity":
        ranked = sorted(
            (d for d in diagnoses if d.code != "ok"),
            key=lambda d: (d.conf, d.severity),
            reverse=True,
        )[:5]
        if not ranked:
            ranked = [DiagnosisIn(code="ok", conf=0.5)]
        hypotheses = [
            Hypothesis(
                code=d.code,
                rationale=explain(d.code, d.string, req.target_chord),
                rank=i + 1,
            )
            for i, d in enumerate(ranked)
        ]
        return AmbiguityResolution(
            hypotheses=hypotheses,
            note="Ranked possibilities only — not a verdict. Try the top one first.",
        )

    if req.mode == "summary":
        counts: dict[str, int] = {}
        for d in diagnoses:
            if d.code != "ok":
                counts[d.code] = counts.get(d.code, 0) + 1
        recurring = [c for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])][:7]
        if recurring:
            summary = "Most-repeated issues this session: " + ", ".join(
                explain(c) for c in recurring[:2]
            )
        else:
            summary = "Clean session — no recurring issues stood out. Keep the strum even and the shapes crisp."
        return SessionSummary(
            summary=summary,
            recurring=recurring,
            next_drills=[f"Repeat {req.target_chord or 'the target chord'} slowly, watching the {explain(c).split('.')[0].lower()}" for c in recurring[:3]]
            or ["Add a second chord and practise the change on a slow metronome."],
        )

    # content
    return _fallback_drill(req)
