# The §9.1 bounded Diagnosis taxonomy — the SINGLE source of truth on the
# backend. Coach output is constrained to these codes (ADR-008 hard safeguard);
# anything else is rejected and the template fallback serves instead.
#
# KEEP IN SYNC with apps/web/src/fusion/diagnosis.ts DIAGNOSIS_CODES. A drift
# test (tests/test_taxonomy.py) asserts these match the shipped client list.
from typing import Literal, get_args

DiagnosisCode = Literal[
    "wrong_fret",
    "wrong_string",
    "muted_string",
    "behind_fret",
    "missing_note",
    "late_strum",
    "ok",
]
DIAGNOSIS_CODES: tuple[str, ...] = get_args(DiagnosisCode)

# feedback_priority / content-generator drills never carry "ok" (§9.4).
PriorityCode = Literal[
    "wrong_fret",
    "wrong_string",
    "muted_string",
    "behind_fret",
    "missing_note",
    "late_strum",
]
PRIORITY_CODES: tuple[str, ...] = get_args(PriorityCode)
