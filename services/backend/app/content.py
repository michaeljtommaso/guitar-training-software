# Content endpoints (ADR-009): serve the lesson JSONs (data/lessons) and the
# open-chord library (data/chords). Static content over HTTPS — never the
# perception loop. Files are read once and cached.
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Optional

from fastapi import APIRouter

from .config import DATA_DIR

router = APIRouter(prefix="/api/content", tags=["content"])


@lru_cache(maxsize=1)
def load_lessons() -> list[dict[str, Any]]:
    lessons_dir = DATA_DIR / "lessons"
    out: list[dict[str, Any]] = []
    for path in sorted(lessons_dir.glob("*.json")):
        out.append(json.loads(path.read_text(encoding="utf-8")))
    return out


@lru_cache(maxsize=1)
def load_chords() -> dict[str, Any]:
    path = DATA_DIR / "chords" / "open-chords.json"
    return json.loads(path.read_text(encoding="utf-8"))


def chord_by_name(name: str) -> Optional[dict[str, Any]]:
    target = name.strip().lower()
    for chord in load_chords().get("chords", []):
        if str(chord.get("name", "")).lower() == target:
            return chord
    return None


@router.get("/lessons")
def get_lessons() -> dict[str, Any]:
    lessons = load_lessons()
    return {"count": len(lessons), "lessons": lessons}


@router.get("/chords")
def get_chords() -> dict[str, Any]:
    return load_chords()
