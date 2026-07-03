# SUBSCRIPTION provider (env COACH_PROVIDER=claude_cli). Runs coaching turns
# through the LOCAL authenticated Claude Code CLI in non-interactive print mode
# — NO API key. The turn is billed to the machine owner's Claude subscription
# (OAuth/keychain), which is why this is single-machine, owner-only, and the
# multi-user path stays the `anthropic` (API-key) provider.
#
# CLI CONTRACT (verified empirically against claude 2.1.200, `claude --help`):
#   -p / --print              non-interactive: print the reply and exit.
#   --output-format json      one JSON result envelope on stdout (parsed below).
#   --system-prompt <s>       REPLACES Claude Code's default agent prompt with
#                             our coach contract (same modes.py text) → clean
#                             text-in / text-out, not a coding agent.
#   --tools ""                disables ALL built-in tools → pure text turn, no
#                             tool execution (`""` = disable all, per --help).
#   --strict-mcp-config       ignore the owner's MCP servers (none are supplied)
#                             → hermetic, fast, nothing external spawned.
#   --model <m>               optional; omitted → the CLI's own default model.
# The prompt (user message) is fed on STDIN so its size never hits argv limits.
# We do NOT use --bare: it forces ANTHROPIC_API_KEY and ignores OAuth, which
# would defeat subscription billing.
#
# BUDGET / kill-switch: the JSON envelope reports real usage.input_tokens /
# usage.output_tokens — we record those so the daily/session token cap binds.
# Subscription usage is NOT API dollar spend (total_cost_usd is only a notional
# API-equivalent price), but recording the real TOKEN counts still caps call
# VOLUME, which is exactly what the kill-switch needs. If usage is ever absent
# we record a conservative flat estimate (COACH_CLI_EST_TOKENS) so a run never
# escapes the cap.
#
# VALIDATION / budget ordering (deliberate, see modes/ws): on a SUCCESSFUL CLI
# run we emit the reply text + real usage and let ws.py run validate_output +
# budget.record — the SAME single validation authority the anthropic provider
# uses. This preserves the invariant "record actual spend even if the output
# turns out bad" (ws.py): a real subscription turn always moves the cap, even
# when its text fails the taxonomy schema and ws serves the template fallback.
# ProviderError is raised only when the CLI itself failed (spawn/timeout/
# non-zero exit/unparseable-or-error envelope) — i.e. no trustworthy reply or
# usage exists — and ws then serves the template fallback. Either way: template
# fallback, never passthrough.
#
# HYGIENE: no API key is involved. The subprocess env is a minimal allowlist
# (PATH + the CLI's config-dir vars) that deliberately EXCLUDES ANTHROPIC_API_KEY
# so the turn can never be billed to a key instead of the subscription. The full
# prompt and reply are never logged at INFO.
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import tempfile
from typing import Any, AsyncIterator

from .contract import Message, ProviderError, StreamDelta, StreamEnd, StreamEvent, TextBlock, Usage

log = logging.getLogger(__name__)

# Env vars the CLI needs to run and authenticate against the owner's
# subscription (config dir under USERPROFILE/HOME, node/npm dirs, temp).
# ANTHROPIC_API_KEY is intentionally NOT here — subscription mode must never
# fall back to key billing.
_ENV_ALLOW = (
    "PATH", "Path", "PATHEXT",
    "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
    "APPDATA", "LOCALAPPDATA",
    "SystemRoot", "SystemDrive", "COMSPEC", "windir",
    "TEMP", "TMP", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
    "CLAUDE_CONFIG_DIR",
)


def _min_env() -> dict[str, str]:
    return {k: os.environ[k] for k in _ENV_ALLOW if k in os.environ}


def _spawn_kwargs() -> dict[str, Any]:
    # New process group so a timeout can kill the CLI AND any children it spawns
    # (a leaked `claude` holds a subscription slot).
    if sys.platform == "win32":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def _kill_tree(proc: Any) -> None:
    proc.kill()  # the direct child
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True, check=False, timeout=5,
            )
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:  # process already gone / no group — best effort
        pass


def _render_prompt(messages: list[Message]) -> str:
    # Text-only transport tonight (documented non-goal: no keyframes through the
    # CLI). The prompt is already assembled + fenced by modes.py; we only carry
    # its text.
    parts: list[str] = []
    for m in messages:
        for b in m.content:
            if isinstance(b, TextBlock):
                parts.append(b.text)
    return "\n".join(parts)


async def _run_cli(
    argv: list[str], stdin: bytes, timeout: float, env: dict[str, str], cwd: str
) -> tuple[int, bytes, bytes]:
    """Spawn the CLI (arg LIST, never a shell), feed the prompt on stdin, and
    return (returncode, stdout, stderr). Kills the process group on timeout."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=cwd,
            **_spawn_kwargs(),
        )
    except (OSError, ValueError) as exc:
        raise ProviderError(f"claude cli spawn failed: {type(exc).__name__}") from exc

    try:
        out, err = await asyncio.wait_for(proc.communicate(input=stdin), timeout=timeout)
    except asyncio.TimeoutError as exc:
        _kill_tree(proc)
        try:
            await proc.wait()
        except Exception:
            pass
        raise ProviderError(f"claude cli timed out after {timeout:.0f}s") from exc
    return proc.returncode or 0, out or b"", err or b""


def _parse_envelope(out: bytes) -> tuple[str, Usage | None]:
    """Parse the `--output-format json` result envelope → (reply_text, usage).
    Raises ProviderError on non-JSON, an error envelope, or a missing/empty
    reply — the caller has no trustworthy result and ws serves templates."""
    text = out.decode("utf-8", "replace").strip()
    if not text:
        raise ProviderError("claude cli returned empty output")
    try:
        env = json.loads(text)
    except json.JSONDecodeError:
        # Tolerate a stray leading log line: retry on the last non-empty line.
        last = text.splitlines()[-1].strip()
        try:
            env = json.loads(last)
        except json.JSONDecodeError as exc:
            raise ProviderError("claude cli output was not JSON") from exc
    if not isinstance(env, dict):
        raise ProviderError("claude cli envelope was not an object")
    if env.get("is_error") or env.get("subtype") != "success" or env.get("type") != "result":
        raise ProviderError(f"claude cli reported error (subtype={env.get('subtype')!r})")
    reply = env.get("result")
    if not isinstance(reply, str) or not reply.strip():
        raise ProviderError("claude cli envelope had no reply text")
    usage = env.get("usage")
    if isinstance(usage, dict) and ("input_tokens" in usage or "output_tokens" in usage):
        return reply, Usage(
            input_tokens=int(usage.get("input_tokens", 0) or 0),
            output_tokens=int(usage.get("output_tokens", 0) or 0),
        )
    return reply, None  # caller substitutes the flat estimate


class ClaudeCliProvider:
    name = "claude_cli"

    def __init__(
        self,
        *,
        cli_bin: str = "claude",
        model: str | None = None,
        timeout: float = 60.0,
        est_tokens: int = 2000,
    ) -> None:
        self._cli_bin = cli_bin
        self._model = model
        self._timeout = timeout
        self._est_tokens = max(1, est_tokens)
        # Neutral cwd so no repo CLAUDE.md / project settings leak into the turn.
        self._cwd = tempfile.gettempdir()

    def _argv(self, cli: str, system: str) -> list[str]:
        argv = [
            cli, "-p",
            "--output-format", "json",
            "--system-prompt", system,
            "--tools", "",            # no tool execution — pure text turn
            "--strict-mcp-config",    # ignore the owner's MCP servers
        ]
        if self._model:
            argv += ["--model", self._model]
        return argv

    async def stream(
        self, *, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[StreamEvent]:
        resolved = shutil.which(self._cli_bin)
        if resolved is None and not os.path.isfile(self._cli_bin):
            raise ProviderError(f"claude cli not found on PATH ({self._cli_bin!r})")
        argv = self._argv(resolved or self._cli_bin, system)
        prompt = _render_prompt(messages)

        rc, out, err = await _run_cli(
            argv, prompt.encode("utf-8"), self._timeout, _min_env(), self._cwd
        )
        if rc != 0:
            log.warning("claude cli exited nonzero rc=%s", rc)
            raise ProviderError(f"claude cli exited {rc}")

        reply, usage = _parse_envelope(out)
        if usage is None:
            # No usage in the envelope → conservative flat estimate so the run
            # still counts against the cap (subscription volume, not $ spend).
            usage = Usage(input_tokens=self._est_tokens, output_tokens=0)
        log.debug("claude cli turn ok in=%s out=%s", usage.input_tokens, usage.output_tokens)

        # Single delta (print mode is turn-based — no fake token-by-token). ws.py
        # records `usage` and runs validate_output; bad text → template fallback.
        yield StreamDelta(reply)
        yield StreamEnd(usage)
