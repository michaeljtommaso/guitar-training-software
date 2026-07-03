# HARD cost-cap kill-switch (§15, ADR-012). "An alert is not a cap": when a
# session or the global daily budget is exhausted, check() RAISES and the WS
# layer refuses the provider call and serves the template fallback instead —
# the spend is actually blocked, not merely logged.
#
# State is PERSISTED in sqlite (stdlib), so the cap survives a process restart:
# a fresh process reading the same db sees the accumulated spend and stays
# blocked. Token accounting is per-session AND global-per-day.
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timezone


class BudgetExceeded(RuntimeError):
    def __init__(self, scope: str, spent: int, cap: int) -> None:
        super().__init__(f"cost cap reached ({scope}): {spent} ≥ {cap} tokens")
        self.scope = scope
        self.spent = spent
        self.cap = cap


class Budget:
    def __init__(self, db_path: str, daily_token_cap: int, session_token_cap: int) -> None:
        self.daily_cap = daily_token_cap
        self.session_cap = session_token_cap
        # check_same_thread=False: FastAPI may serve WS turns on different
        # threads; every write commits immediately and rows are append-only, so
        # there is no cross-thread mutation hazard beyond sqlite's own locking.
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS spend "
            "(ts TEXT, day TEXT, session TEXT, tokens INTEGER)"
        )
        self._conn.commit()

    @staticmethod
    def _today() -> str:
        return date.today().isoformat()

    def daily_total(self) -> int:
        row = self._conn.execute(
            "SELECT COALESCE(SUM(tokens),0) FROM spend WHERE day=?", (self._today(),)
        ).fetchone()
        return int(row[0])

    def session_total(self, session_id: str) -> int:
        row = self._conn.execute(
            "SELECT COALESCE(SUM(tokens),0) FROM spend WHERE day=? AND session=?",
            (self._today(), session_id),
        ).fetchone()
        return int(row[0])

    def check(self, session_id: str) -> None:
        """Raise BudgetExceeded if this session or the day is already at/over cap.
        Called BEFORE every provider request — the kill-switch."""
        daily = self.daily_total()
        if daily >= self.daily_cap:
            raise BudgetExceeded("daily", daily, self.daily_cap)
        sess = self.session_total(session_id)
        if sess >= self.session_cap:
            raise BudgetExceeded("session", sess, self.session_cap)

    def record(self, session_id: str, input_tokens: int, output_tokens: int) -> None:
        """Persist actual spend after a provider turn completes."""
        tokens = max(0, int(input_tokens)) + max(0, int(output_tokens))
        self._conn.execute(
            "INSERT INTO spend (ts, day, session, tokens) VALUES (?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), self._today(), session_id, tokens),
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()
