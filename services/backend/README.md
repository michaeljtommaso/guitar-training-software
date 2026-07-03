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
