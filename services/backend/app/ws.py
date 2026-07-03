# /ws/coach — the WebSocket coaching stream (ADR-009: WS only for coaching,
# never the perception loop). Per turn the client sends a sparse structured
# event (summary, recent diagnoses, ≤3 keyframes); the server applies every
# guardrail, then streams a coach turn back.
#
# Guardrail order per turn (all must hold, else refuse or fall back):
#   1. parse + size validation (oversized payload → refused, injection part b)
#   2. per-client rate limit (token bucket)           → refuse
#   3. concurrency cap (maxInstances analog)          → refuse
#   4. HARD cost-cap kill-switch (budget.check)        → template fallback
#   5. provider stream → validate output vs §9.1 schema
#        valid   → stream + final (source=model, labelled with provider name)
#        invalid → template fallback (never passthrough)
#        error   → template fallback (graceful degradation)
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError

from .coach import modes, templates
from .proxy.budget import BudgetExceeded
from .proxy.contract import ProviderError, StreamDelta, StreamEnd
from .schemas import CoachRequest, validate_output

router = APIRouter()


def _client_id(ws: WebSocket) -> str:
    # Prefer an explicit ?client= tag; fall back to the peer host.
    q = ws.query_params.get("client")
    if q:
        return q[:128]
    return ws.client.host if ws.client else "anon"


def _final(source: str, provider: str, req: CoachRequest, data: BaseModel, reason: str | None = None) -> dict[str, Any]:
    msg = {
        "type": "final",
        "mode": req.mode,
        "source": source,  # "model" | "template"
        "provider": provider,  # provider name (e.g. "fake") or "template"
        "data": data.model_dump(),
    }
    if reason:
        msg["reason"] = reason
    return msg


async def _serve_turn(ws: WebSocket, raw: Any) -> None:
    # 1. parse + strict size validation.
    try:
        req = CoachRequest.model_validate(raw)
    except ValidationError:
        await ws.send_json({"type": "error", "reason": "bad_request"})
        return

    state = ws.app.state
    client = _client_id(ws)

    # 2. rate limit.
    if not state.bucket.allow(client):
        await ws.send_json({"type": "error", "reason": "rate_limited"})
        return

    # 3. concurrency cap.
    if not state.concurrency.try_acquire():
        await ws.send_json({"type": "error", "reason": "busy"})
        return

    try:
        # 4. HARD cost-cap kill-switch — refuse the provider, serve templates.
        try:
            state.budget.check(req.session_id)
        except BudgetExceeded as exc:
            fb = templates.fallback_output(req)
            await ws.send_json(_final("template", "template", req, fb, reason=f"budget_{exc.scope}"))
            return

        provider = state.provider
        system = modes.build_system(req.mode)
        messages = modes.build_messages(req)

        # 5. stream the provider.
        buf: list[str] = []
        usage = None
        try:
            async for evt in provider.stream(
                system=system, messages=messages, max_tokens=state.config.max_output_tokens
            ):
                if isinstance(evt, StreamDelta):
                    buf.append(evt.text)
                    await ws.send_json({"type": "delta", "text": evt.text})
                elif isinstance(evt, StreamEnd):
                    usage = evt.usage
        except ProviderError:
            fb = templates.fallback_output(req)
            await ws.send_json(_final("template", "template", req, fb, reason="provider_error"))
            return

        # The provider ran → record actual spend (even if output turns out bad).
        if usage is not None:
            state.budget.record(req.session_id, usage.input_tokens, usage.output_tokens)

        # Validate output against the strict §9.1 schema — never passthrough.
        validated = validate_output(req.mode, "".join(buf))
        if validated is None:
            fb = templates.fallback_output(req)
            await ws.send_json(_final("template", "template", req, fb, reason="invalid_output"))
            return

        await ws.send_json(_final("model", provider.name, req, validated))
    finally:
        state.concurrency.release()


@router.websocket("/ws/coach")
async def coach_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_json()
            await _serve_turn(websocket, raw)
    except WebSocketDisconnect:
        return
    except (ValueError, TypeError):
        # Non-JSON frame — close politely.
        await websocket.close(code=1003)
