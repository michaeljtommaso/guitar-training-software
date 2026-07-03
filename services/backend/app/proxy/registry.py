# Provider registry — picks the adapter by env (ADR-011). NO provider name is
# hard-coded anywhere in app logic outside this file; everything else talks to
# the CoachProvider contract.
from __future__ import annotations

from ..config import Config
from .anthropic import AnthropicProvider
from .claude_cli import ClaudeCliProvider
from .contract import CoachProvider
from .fake import FakeProvider


def get_provider(cfg: Config) -> CoachProvider:
    name = cfg.provider.lower()
    if name == "fake":
        return FakeProvider()
    if name == "anthropic":
        return AnthropicProvider(api_key=cfg.api_key, model=cfg.model, api_base=cfg.api_base)
    if name == "claude_cli":
        # Subscription mode: coaching via the local authenticated Claude Code CLI.
        return ClaudeCliProvider(
            cli_bin=cfg.cli_bin,
            model=cfg.cli_model,
            timeout=cfg.cli_timeout,
            est_tokens=cfg.cli_est_tokens,
        )
    raise ValueError(
        f"unknown COACH_PROVIDER: {cfg.provider!r} (expected 'anthropic', 'claude_cli', or 'fake')"
    )
