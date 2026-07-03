# Backend config — all knobs read from env with sensible defaults (§15).
# The frontier key lives ONLY here (env), never in code, never logged.
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent  # services/backend
REPO_ROOT = BACKEND_DIR.parent.parent  # repo root
DATA_DIR = REPO_ROOT / "data"  # data/lessons/*.json, data/chords/*.json
STORAGE_DIR = BACKEND_DIR / "storage"  # clip/session uploads + budget db (gitignored)


class Config:
    def __init__(self) -> None:
        # Provider bound to a CAPABILITY CONTRACT, not a name (ADR-011). The
        # registry picks the adapter by this env value. Default "anthropic" so
        # production is correct-by-default; tests/e2e set COACH_PROVIDER=fake.
        self.provider = os.getenv("COACH_PROVIDER", "anthropic")
        # Model id from env with a sensible multimodal-streaming default.
        self.model = os.getenv("COACH_MODEL", "claude-opus-4-8")
        # Server-owned key (env only). May be None tonight (no key available).
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.api_base = os.getenv("ANTHROPIC_API_BASE", "https://api.anthropic.com")
        self.max_output_tokens = int(os.getenv("COACH_MAX_OUTPUT_TOKENS", "1024"))

        # Hard cost-cap kill-switch (§15: "an alert is not a cap"). Persisted.
        self.budget_db = os.getenv("COACH_BUDGET_DB", str(STORAGE_DIR / "budget.sqlite"))
        self.daily_token_cap = int(os.getenv("COACH_DAILY_TOKEN_CAP", "2000000"))
        self.session_token_cap = int(os.getenv("COACH_SESSION_TOKEN_CAP", "60000"))

        # Rate limiting (token bucket) + concurrency (maxInstances analog).
        self.rate_capacity = int(os.getenv("COACH_RATE_CAPACITY", "5"))
        self.rate_refill_per_sec = float(os.getenv("COACH_RATE_REFILL", "0.5"))
        self.max_instances = int(os.getenv("COACH_MAX_INSTANCES", "4"))

        # Request-size guardrails (injection defense: reject oversized payloads).
        self.max_question_chars = int(os.getenv("COACH_MAX_QUESTION_CHARS", "2000"))
        self.max_diagnoses = int(os.getenv("COACH_MAX_DIAGNOSES", "40"))
        self.max_keyframes = int(os.getenv("COACH_MAX_KEYFRAMES", "3"))
        self.max_keyframe_chars = int(os.getenv("COACH_MAX_KEYFRAME_CHARS", "400000"))


def load_config() -> Config:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return Config()
