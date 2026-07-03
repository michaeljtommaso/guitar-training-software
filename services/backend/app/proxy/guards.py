# Per-client rate limiting (token bucket) + a concurrency cap (the cloud
# `maxInstances` analog) (§15). Both are deterministic and unit-tested.
from __future__ import annotations

import time


class TokenBucket:
    """One bucket per client id. `capacity` tokens, refilled `refill_per_sec`.
    `allow` consumes one token; refuses when empty. `now` is injectable so the
    refill math is testable without sleeping."""

    def __init__(self, capacity: int, refill_per_sec: float) -> None:
        self.capacity = float(capacity)
        self.refill_per_sec = float(refill_per_sec)
        self._tokens: dict[str, float] = {}
        self._last: dict[str, float] = {}

    def allow(self, client: str, now: float | None = None) -> bool:
        t = time.monotonic() if now is None else now
        tokens = self._tokens.get(client, self.capacity)
        last = self._last.get(client, t)
        tokens = min(self.capacity, tokens + (t - last) * self.refill_per_sec)
        self._last[client] = t
        if tokens >= 1.0:
            self._tokens[client] = tokens - 1.0
            return True
        self._tokens[client] = tokens
        return False


class Concurrency:
    """At most `limit` provider turns in flight at once. Single event loop →
    no lock needed. try_acquire() refuses (rather than queues) at the cap so
    overload is a demonstrable, tested block, not an unbounded backlog.
    # ponytail: single asyncio loop, plain counter; add a real semaphore only
    # if this ever runs multi-threaded per request."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.active = 0

    def try_acquire(self) -> bool:
        if self.active >= self.limit:
            return False
        self.active += 1
        return True

    def release(self) -> None:
        self.active = max(0, self.active - 1)
