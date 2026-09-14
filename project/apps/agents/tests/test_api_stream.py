import json
import pytest
from fastapi.testclient import TestClient

from agents.api import app

client = TestClient(app)

TOKEN = "token-de-prueba-suficientemente-largo"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("AGENTS_API_TOKEN", TOKEN)


VOLTAGE_DIVIDER_SPEC = {
    "blocks": [
        {
            "id": "block-1",
            "type": "catalog",
            "params": {
                "circuit_id": "voltage_divider",
                "params": {"v_in": 12.0, "v_out": 5.0},
                "metric": "v_out",
                "target": 5.0,
            },
        }
    ],
    "max_iterations": 2,
}


def test_runs_stream_requiere_auth():
    response = client.post("/runs/stream", json={"user_id": "user-1", "circuit_spec": VOLTAGE_DIVIDER_SPEC})
    assert response.status_code == 401


def test_runs_stream_emite_etapas_y_done():
    response = client.post(
        "/runs/stream",
        json={"user_id": "user-1", "circuit_spec": VOLTAGE_DIVIDER_SPEC},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    lines = response.text.strip().split("\n")
    events = []
    current_event = None

    for line in lines:
        if line.startswith("event: "):
            current_event = line.replace("event: ", "").strip()
        elif line.startswith("data: ") and current_event:
            data = json.loads(line.replace("data: ", "").strip())
            events.append((current_event, data))
            current_event = None

    event_names = [e[0] for e in events]
    assert "stage" in event_names
    assert "done" in event_names

    # Verificar que pasa por las etapas principales
    stage_events = [e[1] for e in events if e[0] == "stage"]
    stage_kinds = [s["kind"] for s in stage_events]

    assert "interpretation" in stage_kinds
    assert "calculation" in stage_kinds
    assert "simulation" in stage_kinds
    assert "curation" in stage_kinds
    assert "result" in stage_kinds

    # Verificar evento done final
    done_event = next(e[1] for e in events if e[0] == "done")
    assert done_event["verdict"]["status"] == "accepted"
    assert "block-1" in done_event["netlists"]
