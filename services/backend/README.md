# services/backend

Thin FastAPI service. Currently exposes `GET /health` only (model proxy, content, and clip endpoints land in WP-5).

## Run

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # or: .venv/bin/pip install -r requirements.txt on macOS/Linux
.venv\Scripts\uvicorn app.main:app --reload      # or: .venv/bin/uvicorn app.main:app --reload
```

## Test

```
.venv\Scripts\python -m pytest -q
```

## Coach provider (`COACH_PROVIDER`)

The coach picks its backend by env (ADR-011); the client never names a provider.

- `anthropic` (default) — Anthropic Messages API via `ANTHROPIC_API_KEY`. The
  **multi-user path**: multimodal (keyframes) and true streaming.
- `claude_cli` — **subscription mode**. Coach turns run through the local
  authenticated Claude Code CLI (`claude -p`), billed to the machine owner's
  subscription with **no API key**. For running it off your own subscription now,
  before keys exist:

  ```
  set COACH_PROVIDER=claude_cli
  .venv\Scripts\uvicorn app.main:app
  ```

  Requires `claude` on PATH and already logged in (`claude` once, interactively).
  Limitations tonight: single-machine and owner-only (one subscription);
  **text-only** (keyframes are dropped — no multimodal through the CLI);
  turn-based, so the reply arrives as a single stream delta (print mode is not
  token-streamed). The kill-switch still binds: real `usage` tokens from the CLI
  are recorded against the daily/session cap (subscription usage is call-volume,
  not API dollars). Tunables: `COACH_CLI_MODEL` (default = CLI's default model),
  `COACH_CLI_TIMEOUT` (60s), `COACH_CLI_EST_TOKENS` (2000, used only if the CLI
  omits usage), `COACH_CLI_BIN`.
- `fake` — deterministic canned turns for tests/e2e (no key, labelled `fake`).
