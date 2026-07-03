from fastapi import FastAPI

app = FastAPI(title="guitar-tutor-backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
