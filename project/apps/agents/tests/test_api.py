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


VOLTAGE_DIVIDER_SPEC = {
    "blocks": [
        {
            "id": "block-1",
            "type": "catalog",
            "params": {
                "circuit_id": "voltage_divider",
                "params": {"v_in": 12.0, "v_out": 5.0},
                "requirements": [{"measure": "v_out", "value": 5.0}],
            },
        }
    ],
    "max_iterations": 5,
}


def test_runs_con_circuit_spec_devuelve_veredicto_y_netlist():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": VOLTAGE_DIVIDER_SPEC},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 200
    body = response.json()

    assert body["verdict"]["status"] == "accepted"
    assert "block-1" in body["netlists"]
    assert "R1" in body["netlists"]["block-1"]["text"]
    assert body["sim_results"]["block-1"]["sim_error"] is None
    assert body["history"]


def test_runs_con_spec_invalido_devuelve_200_con_veredicto_rechazado():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {"blocks": [], "max_iterations": 5}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    # El grafo siempre termina con veredicto en lugar de lanzar: un spec
    # inválido es un resultado, no un error HTTP.
    assert response.status_code == 200
    assert response.json()["verdict"]["status"] == "rejected"


def test_metrics_summary_sin_authorization_es_401():
    response = client.get("/metrics/summary")
    assert response.status_code == 401


def test_metrics_summary_con_token_devuelve_estructura():
    response = client.get(
        "/metrics/summary?days=7",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "status" in body
    # Si Langfuse no está configurado en entorno de test devuelve 'unavailable' con metrics=None
    # Si estuviera configurado devuelve 'ok' con metrics
    assert body["status"] in ("ok", "unavailable", "error")



# --- Fase 7: imágenes de entrada -------------------------------------------


class _GrafoQueCaptura:
    def __init__(self):
        self.estado = None

    def invoke(self, initial_state, config=None):
        self.estado = initial_state
        return {
            **initial_state,
            "verdict": None,
            "outcome": {"mode": "chat", "reply": "ok"},
        }


def test_runs_lleva_las_imagenes_al_estado_inicial(monkeypatch):
    import agents.api as api_module

    grafo = _GrafoQueCaptura()
    monkeypatch.setattr(api_module, "_graph", lambda: grafo)
    images = [{"media_type": "image/png", "data": "iVBORw0KGgo="}]

    response = client.post(
        "/runs",
        json={"user_id": "user-1", "request_text": "resuelve la Fig. P2.7", "images": images},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 200
    assert grafo.estado["images"] == images
    # las imágenes no vuelven en la respuesta: el server ya las tiene
    assert "images" not in response.json()


def test_runs_sin_imagenes_deja_el_canal_vacio(monkeypatch):
    import agents.api as api_module

    grafo = _GrafoQueCaptura()
    monkeypatch.setattr(api_module, "_graph", lambda: grafo)

    response = client.post(
        "/runs",
        json={"user_id": "user-1", "request_text": "hola"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 200
    assert grafo.estado["images"] is None


def test_runs_rechaza_un_tipo_de_imagen_fuera_de_la_lista():
    response = client.post(
        "/runs",
        json={
            "user_id": "user-1",
            "request_text": "x",
            "images": [{"media_type": "image/svg+xml", "data": "PHN2Zz4="}],
        },
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 422
