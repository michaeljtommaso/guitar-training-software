from fastapi.testclient import TestClient

from app.main import create_app


def _app(monkeypatch, tmp_path, **env):
    monkeypatch.setenv("COACH_PROVIDER", "fake")
    monkeypatch.setenv("COACH_BUDGET_DB", str(tmp_path / "budget.sqlite"))
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    return create_app()


def _read_turn(ws):
    """Drain delta frames until the final frame; return (delta_count, final)."""
    deltas = 0
    while True:
        msg = ws.receive_json()
        if msg["type"] == "delta":
            deltas += 1
        elif msg["type"] == "final":
            return deltas, msg
        else:
            return deltas, msg  # error frame


def test_all_four_modes_stream_structured_replies(monkeypatch, tmp_path):
    client = TestClient(_app(monkeypatch, tmp_path))
    with client.websocket_connect("/ws/coach") as ws:
        for mode in ["conversational", "ambiguity", "summary", "content"]:
            ws.send_json(
                {
                    "mode": mode,
                    "session_id": "s1",
                    "target_chord": "C",
                    "recent_diagnoses": [{"code": "muted_string", "string": 2, "conf": 0.6}],
                }
            )
            deltas, final = _read_turn(ws)
            assert deltas > 0, f"{mode} did not stream"
            assert final["type"] == "final"
            assert final["mode"] == mode
            assert final["source"] == "model"
            assert final["provider"] == "fake"  # labelled — never presented as live
            assert final["data"]


def test_budget_kill_switch_falls_back_to_templates_over_ws(monkeypatch, tmp_path):
    # Session cap of 1 token → the first turn records spend over cap, the second
    # is blocked and served by the template fallback (labelled source=template).
    client = TestClient(_app(monkeypatch, tmp_path, COACH_SESSION_TOKEN_CAP=1))
    with client.websocket_connect("/ws/coach") as ws:
        req = {"mode": "conversational", "session_id": "capped", "recent_diagnoses": [{"code": "muted_string", "string": 2, "conf": 0.6}]}
        ws.send_json(req)
        _, first = _read_turn(ws)
        assert first["source"] == "model"

        ws.send_json(req)
        _, second = _read_turn(ws)
        assert second["source"] == "template"
        assert second["provider"] == "template"
        assert second["reason"].startswith("budget")
        assert second["data"]  # still a usable coached reply


def test_rate_limit_refuses(monkeypatch, tmp_path):
    client = TestClient(_app(monkeypatch, tmp_path, COACH_RATE_CAPACITY=1, COACH_RATE_REFILL=0))
    with client.websocket_connect("/ws/coach") as ws:
        req = {"mode": "conversational", "session_id": "s1"}
        ws.send_json(req)
        _read_turn(ws)  # first consumes the only token
        ws.send_json(req)
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["reason"] == "rate_limited"


def test_bad_request_frame_is_rejected(monkeypatch, tmp_path):
    client = TestClient(_app(monkeypatch, tmp_path))
    with client.websocket_connect("/ws/coach") as ws:
        ws.send_json({"mode": "jailbreak", "session_id": "s1"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["reason"] == "bad_request"
