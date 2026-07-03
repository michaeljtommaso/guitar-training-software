# Blockers Ledger

Entries are appended as they are found during the overnight run.

| Blocker | WP | Why blocked | Assumption made to proceed | Human action needed |
| --- | --- | --- | --- | --- |
| Docker MISSING on build machine | WP-5 | Dockerfile will ship but cannot be built/run locally tonight | Backend runs via uvicorn directly; Dockerfile authored untested | Install Docker Desktop to validate container build |
| gh CLI MISSING | WP-0 | CI YAML cannot be exercised on GitHub tonight | CI steps mirrored as local commands, all run locally | Push to GitHub and confirm Actions run green |
| corepack EPERM (Program Files not writable) | WP-0 | corepack shim install failed | pnpm installed via `npm i -g pnpm` instead | none — cosmetic |
