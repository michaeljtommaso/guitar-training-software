import pytest

from app.coach.templates import explain, fallback_output
from app.schemas import CoachRequest, validate_output
from app.taxonomy import DIAGNOSIS_CODES


def test_every_code_has_a_teacher_string():
    for code in DIAGNOSIS_CODES:
        text = explain(code, string=2, chord="C")
        assert isinstance(text, str) and len(text) > 10


def test_string_slot_filling():
    assert "B" in explain("muted_string", string=2)  # string 2 = B
    assert "high e" in explain("missing_note", string=1)  # string 1 = high e
    # No string → generic wording, no crash.
    assert explain("muted_string", string=None)


@pytest.mark.parametrize("mode", ["conversational", "ambiguity", "summary", "content"])
def test_fallback_output_conforms_to_mode_schema(mode):
    req = CoachRequest(
        mode=mode,
        session_id="s",
        target_chord="C",
        recent_diagnoses=[
            {"code": "muted_string", "string": 2, "conf": 0.6, "severity": 0.5},
            {"code": "late_strum", "conf": 0.4, "severity": 0.3},
        ],
    )
    out = fallback_output(req)
    # Re-validate the dumped fallback through the SAME strict schema a model turn
    # would pass — proves both paths produce identical, valid shapes.
    assert validate_output(mode, out.model_dump_json()) is not None


def test_fallback_is_deterministic():
    req = CoachRequest(
        mode="conversational",
        session_id="s",
        recent_diagnoses=[{"code": "muted_string", "string": 2, "conf": 0.6}],
    )
    assert fallback_output(req).model_dump() == fallback_output(req).model_dump()
