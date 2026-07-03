import base64

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())

PAYLOAD = base64.b64encode(b"fake-clip-bytes").decode()


def test_consent_required():
    r = client.post(
        "/api/clips",
        json={"session_id": "s1", "consent": False, "data_base64": PAYLOAD},
    )
    assert r.status_code == 403


def test_upload_list_delete_roundtrip():
    r = client.post(
        "/api/clips",
        json={"session_id": "s1", "consent": True, "filename": "take.webm", "data_base64": PAYLOAD},
    )
    assert r.status_code == 200
    clip_id = r.json()["id"]

    ids = {c["id"] for c in client.get("/api/clips").json()["clips"]}
    assert clip_id in ids

    # Deletion is first-class.
    d = client.delete(f"/api/clips/{clip_id}")
    assert d.status_code == 200
    ids_after = {c["id"] for c in client.get("/api/clips").json()["clips"]}
    assert clip_id not in ids_after


def test_delete_missing_is_404():
    assert client.delete("/api/clips/does-not-exist").status_code == 404


def test_bad_base64_rejected():
    r = client.post(
        "/api/clips",
        json={"session_id": "s1", "consent": True, "data_base64": "not*base64*"},
    )
    assert r.status_code == 422
