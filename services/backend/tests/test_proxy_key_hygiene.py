import asyncio
import json
import logging

import pytest

from app.proxy.anthropic import AnthropicProvider
from app.proxy.contract import Message, ProviderError, TextBlock

SECRET = "sk-ant-THIS-KEY-MUST-NEVER-LEAK-0xDEADBEEF"


def _drain_expecting_error(provider) -> str:
    async def run() -> str:
        agen = provider.stream(
            system="MODE=conversational\n",
            messages=[Message(role="user", content=[TextBlock(text="hi")])],
            max_tokens=32,
        )
        with pytest.raises(ProviderError) as exc:
            async for _ in agen:
                pass
        return str(exc.value)

    return asyncio.run(run())


def test_key_absent_from_request_body():
    p = AnthropicProvider(api_key=SECRET, model="claude-opus-4-8", api_base="https://api.anthropic.com")
    body = p._body("sys", [Message(role="user", content=[TextBlock(text="hi")])], 64)
    assert SECRET not in json.dumps(body)  # key rides the header, never the body


def test_missing_key_error_has_no_secret():
    p = AnthropicProvider(api_key=None, model="m", api_base="https://api.anthropic.com")
    msg = _drain_expecting_error(p)
    assert SECRET not in msg


def test_transport_error_hides_key():
    # Unroutable base → httpx errors fast; the raised ProviderError must not
    # carry the key (or the URL/headers).
    p = AnthropicProvider(api_key=SECRET, model="m", api_base="http://127.0.0.1:9", timeout=0.3)
    msg = _drain_expecting_error(p)
    assert SECRET not in msg


def test_key_never_logged(caplog):
    caplog.set_level(logging.DEBUG)
    p = AnthropicProvider(api_key=SECRET, model="m", api_base="http://127.0.0.1:9", timeout=0.3)
    _drain_expecting_error(p)
    assert SECRET not in caplog.text
