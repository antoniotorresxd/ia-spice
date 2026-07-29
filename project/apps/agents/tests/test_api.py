import os

import pytest
from fastapi.testclient import TestClient

from agents.api import app

client = TestClient(app)


def test_health_responde_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


TOKEN = "token-de-prueba-suficientemente-largo"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("AGENTS_API_TOKEN", TOKEN)


def test_runs_sin_authorization_es_401():
    response = client.post("/runs", json={"user_id": "user-1", "circuit_spec": {}})
    assert response.status_code == 401


def test_runs_con_token_incorrecto_es_401():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {}},
        headers={"Authorization": "Bearer token-equivocado"},
    )
    assert response.status_code == 401


def test_runs_sin_user_id_es_422():
    response = client.post(
        "/runs",
        json={"circuit_spec": {}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 422


def test_runs_sin_texto_ni_spec_es_400():
    response = client.post(
        "/runs",
        json={"user_id": "user-1"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 400


def test_runs_sin_token_configurado_en_el_entorno_es_503(monkeypatch):
    monkeypatch.delenv("AGENTS_API_TOKEN", raising=False)
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 503
