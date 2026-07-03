# Tests for the subscription provider (COACH_PROVIDER=claude_cli). The subprocess
# is monkeypatched so the whole suite is hermetic — EXCEPT the one live smoke
# test, which is env-gated (LIVE_CLAUDE_CLI=1) and skipped by default.
import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.proxy import claude_cli
from app.proxy.claude_cli import ClaudeCliProvider
from app.proxy.contract import Message, ProviderError, StreamDelta, StreamEnd, TextBlock

# A valid conversational reply (validates against the §9.1 taxonomy schema) and
# the JSON envelope the CLI prints under --output-format json.
_CONV_REPLY = (
    '{"code":"muted_string","message":"Arch that finger so the B string rings.",'
    '"confidence":0.7,"hedged":false}'
)


def _envelope(result: str, *, in_tok=3400, out_tok=120, subtype="success", is_error=False, usage=True):
    env = {"type": "result", "subtype": subtype, "is_error": is_error, "result": result}
    if usage:
        env["usage"] = {"input_tokens": in_tok, "output_tokens": out_tok}
    return json.dumps(env).encode()


class FakeProc:
    def __init__(self, stdout=b"", stderr=b"", returncode=0, hang=False):
        self._stdout, self._stderr, self.returncode = stdout, stderr, returncode
        self._hang, self.pid, self.killed = hang, 424242, False

    async def communicate(self, input=None):
        if self._hang:
            await asyncio.sleep(3600)  # cancelled by wait_for → TimeoutError
        return self._stdout, self._stderr

    def kill(self):
        self.killed = True

    async def wait(self):
        return self.returncode


def _install_exec(monkeypatch, proc, calls):
    async def fake_exec(*argv, **kwargs):
        calls.append({"argv": list(argv), "kwargs": kwargs})
        return proc

    def boom_shell(*a, **k):
        raise AssertionError("create_subprocess_shell (shell=True) must never be used")

    monkeypatch.setattr(claude_cli.shutil, "which", lambda x: "claude")
    monkeypatch.setattr(claude_cli.asyncio, "create_subprocess_exec", fake_exec)
    monkeypatch.setattr(claude_cli.asyncio, "create_subprocess_shell", boom_shell)


def _drain(provider):
    async def run():
        buf, usage = [], None
        async for evt in provider.stream(
            system="MODE=conversational\n(coach contract)",
            messages=[Message(role="user", content=[TextBlock(text="Why is my C muted?")])],
            max_tokens=256,
        ):
            if isinstance(evt, StreamDelta):
                buf.append(evt.text)
            elif isinstance(evt, StreamEnd):
                usage = evt.usage
        return "".join(buf), usage

    return asyncio.run(run())


# ── envelope parsing / streaming ────────────────────────────────────────────


def test_valid_envelope_streams_reply_and_real_usage(monkeypatch):
    calls = []
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY)), calls)
    text, usage = _drain(ClaudeCliProvider())
    assert text == _CONV_REPLY  # single delta carries the whole reply
    assert usage.input_tokens == 3400 and usage.output_tokens == 120  # real numbers


def test_missing_usage_falls_back_to_flat_estimate(monkeypatch):
    calls = []
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY, usage=False)), calls)
    _, usage = _drain(ClaudeCliProvider(est_tokens=2000))
    assert usage.input_tokens == 2000  # documented conservative estimate binds the cap


def test_non_json_output_is_provider_error(monkeypatch):
    _install_exec(monkeypatch, FakeProc(stdout=b"segfault: not json"), [])
    with pytest.raises(ProviderError):
        _drain(ClaudeCliProvider())


def test_error_envelope_is_provider_error(monkeypatch):
    _install_exec(monkeypatch, FakeProc(stdout=_envelope("", subtype="error_max_turns", is_error=True)), [])
    with pytest.raises(ProviderError):
        _drain(ClaudeCliProvider())


def test_nonzero_exit_is_provider_error(monkeypatch):
    _install_exec(monkeypatch, FakeProc(stdout=b"", returncode=1), [])
    with pytest.raises(ProviderError):
        _drain(ClaudeCliProvider())


def test_json_with_leading_log_line_still_parses(monkeypatch):
    noisy = b"[warn] some startup log\n" + _envelope(_CONV_REPLY)
    _install_exec(monkeypatch, FakeProc(stdout=noisy), [])
    text, usage = _drain(ClaudeCliProvider())
    assert text == _CONV_REPLY and usage.input_tokens == 3400


# ── argv / process hygiene ──────────────────────────────────────────────────


def test_argv_is_a_list_with_no_tools_flag_and_never_shell(monkeypatch):
    calls = []
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY)), calls)
    _drain(ClaudeCliProvider())
    argv, kwargs = calls[0]["argv"], calls[0]["kwargs"]
    assert isinstance(argv, list)
    assert "-p" in argv and "--output-format" in argv
    # tool execution disabled: `--tools ""` (empty allowlist).
    assert argv[argv.index("--tools") + 1] == ""
    assert "--strict-mcp-config" in argv  # owner's MCP servers ignored
    assert kwargs.get("shell") is not True  # exec, never shell=True


def test_model_flag_only_when_configured(monkeypatch):
    calls = []
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY)), calls)
    _drain(ClaudeCliProvider(model="opus"))
    argv = calls[0]["argv"]
    assert argv[argv.index("--model") + 1] == "opus"

    calls.clear()
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY)), calls)
    _drain(ClaudeCliProvider())  # no model → no flag
    assert "--model" not in calls[0]["argv"]


def test_subprocess_env_excludes_api_key(monkeypatch):
    # Even with a key in the server env, subscription mode must not pass it to
    # the child (would bill the key, not the subscription).
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-MUST-NOT-LEAK")
    calls = []
    _install_exec(monkeypatch, FakeProc(stdout=_envelope(_CONV_REPLY)), calls)
    _drain(ClaudeCliProvider())
    env = calls[0]["kwargs"]["env"]
    assert "ANTHROPIC_API_KEY" not in env
    assert "PATH" in env or "Path" in env  # but the CLI can still be found/run


def test_timeout_kills_process_and_is_provider_error(monkeypatch):
    proc = FakeProc(hang=True)
    _install_exec(monkeypatch, proc, [])
    monkeypatch.setattr(claude_cli.subprocess, "run", lambda *a, **k: None)  # no real taskkill
    with pytest.raises(ProviderError):
        _drain(ClaudeCliProvider(timeout=0.05))
    assert proc.killed  # process-group kill path ran


def test_cli_not_found_is_provider_error(monkeypatch):
    monkeypatch.setattr(claude_cli.shutil, "which", lambda x: None)
    with pytest.raises(ProviderError):
        _drain(ClaudeCliProvider(cli_bin="definitely-not-a-real-binary-xyz"))


# ── ws-layer integration: provider chosen by env, budget + template fallback ─


def _ws_app(monkeypatch, tmp_path, run_cli):
    monkeypatch.setattr(claude_cli.shutil, "which", lambda x: "claude")
    monkeypatch.setattr(claude_cli, "_run_cli", run_cli)
    monkeypatch.setenv("COACH_PROVIDER", "claude_cli")
    monkeypatch.setenv("COACH_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    return create_app()


def _turn(ws):
    while True:
        msg = ws.receive_json()
        if msg["type"] in ("final", "error"):
            return msg


def test_ws_valid_turn_is_model_sourced_and_records_budget(monkeypatch, tmp_path):
    async def run_cli(argv, stdin, timeout, env, cwd):
        return 0, _envelope(_CONV_REPLY), b""

    app = _ws_app(monkeypatch, tmp_path, run_cli)
    with TestClient(app).websocket_connect("/ws/coach") as ws:
        ws.send_json({"mode": "conversational", "session_id": "s1",
                      "recent_diagnoses": [{"code": "muted_string", "string": 2, "conf": 0.6}]})
        final = _turn(ws)
    assert final["source"] == "model"
    assert final["provider"] == "claude_cli"  # labelled, never presented as anthropic
    assert app.state.budget.session_total("s1") > 0  # real subscription tokens counted


def test_ws_bad_taxonomy_records_budget_then_templates(monkeypatch, tmp_path):
    # Valid CLI envelope but a code OUTSIDE the taxonomy → ws serves the template
    # fallback, yet the real subscription spend is still recorded (kill-switch).
    bad = '{"code":"delete_everything","message":"x","confidence":0.5,"hedged":false}'

    async def run_cli(argv, stdin, timeout, env, cwd):
        return 0, _envelope(bad), b""

    app = _ws_app(monkeypatch, tmp_path, run_cli)
    with TestClient(app).websocket_connect("/ws/coach") as ws:
        ws.send_json({"mode": "conversational", "session_id": "s2"})
        final = _turn(ws)
    assert final["source"] == "template"
    assert final["reason"] == "invalid_output"
    assert app.state.budget.session_total("s2") > 0  # spend recorded despite bad output


def test_ws_cli_failure_falls_back_to_template(monkeypatch, tmp_path):
    async def run_cli(argv, stdin, timeout, env, cwd):
        return 0, b"not json at all", b""  # malformed envelope → ProviderError

    app = _ws_app(monkeypatch, tmp_path, run_cli)
    with TestClient(app).websocket_connect("/ws/coach") as ws:
        ws.send_json({"mode": "conversational", "session_id": "s3"})
        final = _turn(ws)
    assert final["source"] == "template"
    assert final["provider"] == "template"
    assert final["reason"] == "provider_error"


# ── ONE live smoke test — real subscription, env-gated, skipped by default ───


@pytest.mark.skipif(
    __import__("os").getenv("LIVE_CLAUDE_CLI") != "1",
    reason="live subscription CLI turn; set LIVE_CLAUDE_CLI=1 to run (uses the owner's quota)",
)
def test_live_smoke_one_conversational_turn():
    from app.coach import modes
    from app.schemas import CoachRequest, validate_output

    req = CoachRequest(
        mode="conversational",
        session_id="live-smoke",
        target_chord="C",
        recent_diagnoses=[{"code": "muted_string", "string": 2, "conf": 0.6}],
        question="Why does my C chord sound muted on the B string?",
    )
    system = modes.build_system(req.mode)
    messages = modes.build_messages(req)

    async def run():
        buf, usage = [], None
        async for evt in ClaudeCliProvider(timeout=90).stream(
            system=system, messages=messages, max_tokens=1024
        ):
            if isinstance(evt, StreamDelta):
                buf.append(evt.text)
            elif isinstance(evt, StreamEnd):
                usage = evt.usage
        return "".join(buf), usage

    text, usage = asyncio.run(run())
    validated = validate_output(req.mode, text)
    print(f"\n[LIVE] validated={validated is not None} usage={usage}\n[LIVE] reply={text[:200]!r}")
    assert text  # a real reply came back
    assert usage is not None  # usage recorded → kill-switch binds
