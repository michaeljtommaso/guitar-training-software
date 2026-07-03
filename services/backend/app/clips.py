# Opt-in clip/session upload to LOCAL disk (services/backend/storage/, gitignored).
# Biometric home media is sensitive (§15): consent is REQUIRED to store, and
# deletion is FIRST-CLASS (a real DELETE that removes the bytes, not a soft flag).
from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .config import STORAGE_DIR

router = APIRouter(prefix="/api/clips", tags=["clips"])

CLIPS_DIR = STORAGE_DIR / "clips"
MAX_CLIP_BYTES = 25 * 1024 * 1024  # 25 MB per clip


class ClipUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str = Field(min_length=1, max_length=128)
    # Consent is MANDATORY to store anything — enforced below, not just typed.
    consent: bool = False
    kind: str = Field(default="clip", max_length=32)
    filename: str = Field(default="clip.bin", max_length=200)
    data_base64: str = Field(min_length=1)


def _clips_dir():
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    return CLIPS_DIR


def _meta_path(clip_id: str):
    # clip_id is always a server-minted uuid hex — no user string in the path.
    return _clips_dir() / f"{clip_id}.meta.json"


def _data_path(clip_id: str):
    return _clips_dir() / f"{clip_id}.data"


@router.post("")
def upload_clip(upload: ClipUpload) -> dict[str, Any]:
    if not upload.consent:
        raise HTTPException(status_code=403, detail="consent required to store a clip")
    try:
        raw = base64.b64decode(upload.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="data_base64 is not valid base64")
    if len(raw) > MAX_CLIP_BYTES:
        raise HTTPException(status_code=413, detail="clip exceeds size limit")

    clip_id = uuid.uuid4().hex
    meta = {
        "id": clip_id,
        "session_id": upload.session_id,
        "kind": upload.kind,
        "filename": upload.filename,
        "size_bytes": len(raw),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _data_path(clip_id).write_bytes(raw)
    _meta_path(clip_id).write_text(json.dumps(meta), encoding="utf-8")
    return meta


@router.get("")
def list_clips() -> dict[str, Any]:
    clips: list[dict[str, Any]] = []
    for path in sorted(_clips_dir().glob("*.meta.json")):
        try:
            clips.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return {"count": len(clips), "clips": clips}


@router.delete("/{clip_id}")
def delete_clip(clip_id: str) -> dict[str, Any]:
    meta = _meta_path(clip_id)
    data = _data_path(clip_id)
    if not meta.exists() and not data.exists():
        raise HTTPException(status_code=404, detail="clip not found")
    meta.unlink(missing_ok=True)
    data.unlink(missing_ok=True)
    return {"deleted": clip_id}
