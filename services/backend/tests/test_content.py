from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_lessons_endpoint():
    r = client.get("/api/content/lessons")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] > 0
    for lesson in body["lessons"]:
        assert lesson["id"]
        assert lesson["steps"]


def test_chords_endpoint():
    r = client.get("/api/content/chords")
    assert r.status_code == 200
    body = r.json()
    assert body["tuning"] == "EADGBE"
    names = {c["name"] for c in body["chords"]}
    assert {"C", "G", "D", "A", "E", "Am", "Em", "Dm"} <= names
    # UCI dataset noted as a future import.
    assert "UCI" in body["source"]
