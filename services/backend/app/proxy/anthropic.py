# REAL provider adapter — Anthropic Messages API over httpx, streaming SSE.
# Complete and production-shaped; live calls simply can't run tonight without a
# key (COACH_PROVIDER stays `fake` for tests/e2e).
#
# KEY HYGIENE (§15): the key comes from env (Config → here), rides ONLY the
# x-api-key request header, and is never logged, echoed, or placed in the
# request body or any raised error. This module does no logging at all.
from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from .contract import (
    ImageBlock,
    Message,
    ProviderError,
    StreamDelta,
    StreamEnd,
    StreamEvent,
    TextBlock,
    Usage,
)

ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, *, api_key: str | None, model: str, api_base: str, timeout: float = 60.0) -> None:
        self._api_key = api_key
        self.model = model
        self._url = api_base.rstrip("/") + "/v1/messages"
        self._timeout = timeout

    @staticmethod
    def _content(blocks: list[Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for b in blocks:
            if isinstance(b, TextBlock):
                out.append({"type": "text", "text": b.text})
            elif isinstance(b, ImageBlock):
                out.append(
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": b.media_type, "data": b.data},
                    }
                )
        return out

    def _body(self, system: str, messages: list[Message], max_tokens: int) -> dict[str, Any]:
        # Opus-4.x surface: no temperature/top_p/budget_tokens/thinking config —
        # they 400 on current models. Structured JSON is elicited via the prompt
        # and enforced downstream by schema validation.
        return {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": m.role, "content": self._content(m.content)} for m in messages],
            "stream": True,
        }

    async def stream(
        self, *, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[StreamEvent]:
        if not self._api_key:
            # No key tonight — refuse cleanly; the WS serves the template fallback.
            raise ProviderError("no ANTHROPIC_API_KEY configured")
        body = self._body(system, messages, max_tokens)
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        input_tokens = 0
        output_tokens = 0
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", self._url, json=body, headers=headers) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        # Status only — never the body or headers (no key leak).
                        raise ProviderError(f"provider returned HTTP {resp.status_code}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[len("data:") :].strip()
                        if not data:
                            continue
                        try:
                            evt = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        etype = evt.get("type")
                        if etype == "message_start":
                            input_tokens = int(
                                evt.get("message", {}).get("usage", {}).get("input_tokens", 0) or 0
                            )
                        elif etype == "content_block_delta":
                            delta = evt.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield StreamDelta(delta.get("text", ""))
                        elif etype == "message_delta":
                            output_tokens = int(
                                evt.get("usage", {}).get("output_tokens", output_tokens) or output_tokens
                            )
                        elif etype == "message_stop":
                            break
        except httpx.HTTPError as exc:
            # Type name only — no URL, no headers, no key.
            raise ProviderError(f"provider transport error: {type(exc).__name__}") from exc
        yield StreamEnd(Usage(input_tokens=input_tokens, output_tokens=output_tokens))
