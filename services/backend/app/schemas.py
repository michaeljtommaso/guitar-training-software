# Strict pydantic schemas for the coach (injection defense, part b).
#
# INBOUND: CoachRequest bounds every user-originated field (oversized payloads
# → 422, refused). OUTBOUND: the model's JSON MUST validate against the strict
# per-mode schema whose `code` ∈ the §9.1 taxonomy; anything else (extra keys,
# bad code, non-JSON, injected prose) fails validation and the caller serves
# the template fallback — model output is NEVER passed through unvalidated.
from __future__ import annotations

import json
from typing import Literal, Optional, get_args

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .taxonomy import DiagnosisCode, PriorityCode

# extra="forbid" everywhere: a malicious model that appends fields (or a
# tool-call blob) fails validation instead of leaking through.
_Strict = ConfigDict(extra="forbid")


# ── inbound: the WS coaching request ────────────────────────────────────────

Mode = Literal["conversational", "ambiguity", "summary", "content"]
MODES: tuple[str, ...] = get_args(Mode)


class DiagnosisIn(BaseModel):
    model_config = _Strict
    code: DiagnosisCode
    string: Optional[int] = Field(default=None, ge=1, le=6)
    severity: float = Field(default=0.0, ge=0.0, le=1.0)
    conf: float = Field(default=0.0, ge=0.0, le=1.0)


class CoachRequest(BaseModel):
    model_config = _Strict
    mode: Mode
    session_id: str = Field(min_length=1, max_length=128)
    # opt-in consent flag for anything the request carries (keyframes).
    consent: bool = False
    lesson_id: Optional[str] = Field(default=None, max_length=128)
    target_chord: Optional[str] = Field(default=None, max_length=32)
    summary: str = Field(default="", max_length=2000)
    recent_diagnoses: list[DiagnosisIn] = Field(default_factory=list, max_length=40)
    question: str = Field(default="", max_length=2000)
    # ≤3 base64 JPEG keyframes; only sent when consent is true.
    keyframes: list[str] = Field(default_factory=list, max_length=3)


# ── outbound: per-mode structured output (the model must match one) ──────────


class ConversationalTurn(BaseModel):
    model_config = _Strict
    code: DiagnosisCode
    message: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0.0, le=1.0)
    hedged: bool = False


class Hypothesis(BaseModel):
    model_config = _Strict
    code: DiagnosisCode
    rationale: str = Field(min_length=1, max_length=500)
    rank: int = Field(ge=1)


class AmbiguityResolution(BaseModel):
    model_config = _Strict
    # RANKED HYPOTHESES, never ground truth (§12.2). The note re-states that.
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=5)
    note: str = Field(default="", max_length=500)


class SessionSummary(BaseModel):
    model_config = _Strict
    summary: str = Field(min_length=1, max_length=1500)
    recurring: list[DiagnosisCode] = Field(default_factory=list, max_length=7)
    next_drills: list[str] = Field(default_factory=list, max_length=6)


# Content generator → a drill conforming to the lesson schema (mirrors
# apps/web/src/fusion/lessons.ts so a generated drill is loadable as data).


class Placement(BaseModel):
    model_config = _Strict
    string: int = Field(ge=1, le=6)
    fret: int = Field(ge=0, le=5)


class Fingering(BaseModel):
    model_config = _Strict
    thumb: Optional[Placement] = None
    index: Optional[Placement] = None
    middle: Optional[Placement] = None
    ring: Optional[Placement] = None
    pinky: Optional[Placement] = None


class SuccessCriteria(BaseModel):
    model_config = _Strict
    hold_time_ms: float = Field(ge=0)
    min_audio_conf: float = Field(ge=0.0, le=1.0)
    max_muted_strings: int = Field(ge=0)


class LessonStep(BaseModel):
    model_config = _Strict
    chord: str = Field(min_length=1)
    accepted_fingerings: list[Fingering] = Field(min_length=1)
    expected_strings: list[int] = Field(min_length=1)
    avoid_strings: list[int] = Field(default_factory=list)
    success_criteria: SuccessCriteria
    feedback_priority: list[PriorityCode] = Field(default_factory=list)


class GeneratedDrill(BaseModel):
    model_config = _Strict
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    steps: list[LessonStep] = Field(min_length=1, max_length=8)


_OUTPUT_MODEL: dict[str, type[BaseModel]] = {
    "conversational": ConversationalTurn,
    "ambiguity": AmbiguityResolution,
    "summary": SessionSummary,
    "content": GeneratedDrill,
}


def validate_output(mode: str, raw: str) -> Optional[BaseModel]:
    """Parse + strictly validate model output for `mode`. Returns the model on
    success, or None if the output is non-JSON, malformed, has extra/injected
    fields, or carries a code outside the §9.1 taxonomy — the caller then serves
    the template fallback. NEVER returns unvalidated passthrough."""
    model = _OUTPUT_MODEL.get(mode)
    if model is None:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    try:
        return model.model_validate(data)
    except ValidationError:
        return None
