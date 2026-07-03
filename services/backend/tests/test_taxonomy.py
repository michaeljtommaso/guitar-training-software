from app.config import REPO_ROOT
from app.taxonomy import DIAGNOSIS_CODES, PRIORITY_CODES


def test_seven_bounded_codes():
    assert DIAGNOSIS_CODES == (
        "wrong_fret",
        "wrong_string",
        "muted_string",
        "behind_fret",
        "missing_note",
        "late_strum",
        "ok",
    )
    assert "ok" not in PRIORITY_CODES
    assert set(PRIORITY_CODES) == set(DIAGNOSIS_CODES) - {"ok"}


def test_matches_client_diagnosis_taxonomy():
    # The backend taxonomy MUST match the shipped client list (drift guard).
    text = (REPO_ROOT / "apps" / "web" / "src" / "fusion" / "diagnosis.ts").read_text(
        encoding="utf-8"
    )
    for code in DIAGNOSIS_CODES:
        assert f'"{code}"' in text, f"{code} missing from client diagnosis.ts"
