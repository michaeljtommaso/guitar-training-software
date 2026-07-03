# Backend container (ADR-012). AUTHORED but NOT BUILT tonight — no Docker on
# this machine. Build from the REPO ROOT (context must include data/):
#   docker build -f services/backend/Dockerfile -t guitar-tutor-backend .
#   docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -e COACH_PROVIDER=anthropic \
#     guitar-tutor-backend
#
# The frontier key is injected as an env var at runtime (server-owned, §15) —
# never baked into the image.
FROM python:3.11-slim

WORKDIR /app

# Install deps first for layer caching.
COPY services/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App code + shipped content (lessons + chord library).
COPY services/backend/app ./app
COPY data ./data

# Clip/session uploads land here (gitignored on the host; a volume in prod).
RUN mkdir -p storage

EXPOSE 8000

# COACH_PROVIDER defaults to anthropic; set to `fake` only for offline demos.
ENV COACH_PROVIDER=anthropic
ENV COACH_BUDGET_DB=/app/storage/budget.sqlite

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
