import pytest

from app.proxy.budget import Budget, BudgetExceeded


def test_kill_switch_trips_mid_session_and_persists_across_restart(tmp_path):
    db = str(tmp_path / "budget.sqlite")

    # Process 1: spend crosses the session cap mid-session.
    b = Budget(db, daily_token_cap=1_000_000, session_token_cap=100)
    b.check("sess-A")  # under cap → allowed
    b.record("sess-A", input_tokens=60, output_tokens=50)  # 110 ≥ 100
    with pytest.raises(BudgetExceeded) as exc:
        b.check("sess-A")  # subsequent call is BLOCKED
    assert exc.value.scope == "session"
    b.close()

    # Process 2 (restart): a fresh Budget on the SAME db is still blocked —
    # the cap is persisted, not just an in-memory counter.
    b2 = Budget(db, daily_token_cap=1_000_000, session_token_cap=100)
    with pytest.raises(BudgetExceeded):
        b2.check("sess-A")
    # A different session is still allowed (until the daily cap).
    b2.check("sess-B")
    b2.close()


def test_daily_cap_blocks_all_sessions(tmp_path):
    db = str(tmp_path / "budget.sqlite")
    b = Budget(db, daily_token_cap=50, session_token_cap=1_000_000)
    b.record("s1", 30, 30)  # 60 ≥ 50 daily
    with pytest.raises(BudgetExceeded) as exc:
        b.check("s2")  # unrelated session also blocked once the DAY is capped
    assert exc.value.scope == "daily"
    b.close()
