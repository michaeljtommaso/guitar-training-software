# FastAPI assembly (WP-5). Thin backend (ADR-009): content + clips over HTTPS,
# the coaching stream over WS, and the hardened model proxy behind it. The
# real-time perception loop needs NONE of this — it is client-only.
from fastapi import FastAPI

from .clips import router as clips_router
from .config import load_config
from .content import router as content_router
from .proxy.budget import Budget
from .proxy.guards import Concurrency, TokenBucket
from .proxy.registry import get_provider
from .ws import router as ws_router


def create_app() -> FastAPI:
    app = FastAPI(title="guitar-tutor-backend")
    cfg = load_config()

    # Singletons wired onto app.state so the WS handler (and tests) can reach
    # them. Provider is chosen by env; the budget/guards enforce §15 hardening.
    app.state.config = cfg
    app.state.provider = get_provider(cfg)
    app.state.budget = Budget(cfg.budget_db, cfg.daily_token_cap, cfg.session_token_cap)
    app.state.bucket = TokenBucket(cfg.rate_capacity, cfg.rate_refill_per_sec)
    app.state.concurrency = Concurrency(cfg.max_instances)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(content_router)
    app.include_router(clips_router)
    app.include_router(ws_router)
    return app


app = create_app()
