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
                "requirements": [{"measure": "v_out", "value": 5.0}],
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


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    current_event = None
    for line in text.strip().split("\n"):
        if line.startswith("event: "):
            current_event = line.replace("event: ", "").strip()
        elif line.startswith("data: ") and current_event:
            events.append((current_event, json.loads(line.replace("data: ", "").strip())))
            current_event = None
    return events


class _GrafoDeAnalisis:
    """Grafo falso que reproduce las actualizaciones de una corrida en modo
    análisis: el stream se prueba sin LLM (el modo lo decide el orquestador
    a partir de texto libre)."""

    def __init__(self, coincide: bool = True):
        self._coincide = coincide
        self._outcome = {
            "mode": "analysis",
            "informe": "ANÁLISIS DE LA RED",
            "error": None,
            "resultados": {"nodos": {"a": 5.0}, "validacion": {"coincide": coincide, "error": None}},
        }

    def stream(self, initial_state, config=None, stream_mode=None):
        yield {"orquestador": {"outcome": {"mode": "analysis", "netlist": "R1 a 0 1k"}}}
        yield {"analisis": {"outcome": self._outcome}}

    def get_state(self, config):
        class _Snapshot:
            values = {"outcome": self._outcome, "verdict": None}

        return _Snapshot()


def test_runs_stream_en_modo_analisis_solo_emite_sus_tres_etapas(monkeypatch):
    monkeypatch.setattr("agents.api._graph", lambda: _GrafoDeAnalisis())
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "request_text": "analiza esta red"},
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "text/event-stream"},
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)

    # El server necesita saber cuanto antes que no habrá curación ni
    # documentación, para no dejarlas pendientes en el timeline.
    assert ("mode", {"mode": "analysis"}) in events

    stages = [data for name, data in events if name == "stage"]
    assert {s["kind"] for s in stages} == {"interpretation", "calculation", "simulation"}

    # Cada etapa terminada lleva su duración, también la verificación.
    finales = {s["kind"]: s for s in stages if s["status"] != "active"}
    assert set(finales) == {"interpretation", "calculation", "simulation"}
    for s in finales.values():
        assert s["status"] == "completed"
        assert isinstance(s["durationMs"], int)

    verificacion = finales["simulation"]
    assert verificacion["label"] == "Verificación"
    assert verificacion["actor"] == "ngspice"


def test_el_resumen_de_la_verificacion_dice_que_confirmo_ngspice():
    from agents.api import _resumen_verificacion

    zeq_ok = {"terminales": ["nodo_in", "nodo_out"], "coincide": True, "error": None}
    assert "Z_eq entre nodo_in y nodo_out" in _resumen_verificacion({"coincide": True, "sin_corriente": True, "zeq": zeq_ok})
    assert _resumen_verificacion({"coincide": True}) == "ngspice confirma las tensiones de nodo."
    assert "otra Z_eq" in _resumen_verificacion({"coincide": False, "zeq": {**zeq_ok, "coincide": False}})
    assert "No concluyente" in _resumen_verificacion({"coincide": False, "sin_corriente": True})
    assert "abierta" in _resumen_verificacion({"coincide": False, "zeq": {"coincide": False, "error": "la red está abierta"}})


def test_el_resumen_de_la_documentacion_no_dice_exito_si_no_documento_nada():
    from agents.api import _resumen_documentacion

    doc = {"summary": "x", "tags": [], "components": {}, "measurement_explanation": "y"}
    assert _resumen_documentacion({"b1": doc}) == "Documentación generada con éxito."
    assert _resumen_documentacion({"b1": doc, "b2": None}) == "Documentación generada para 1 de 2 bloques."
    # Caso real: el documentador sin modelo asignado devolvía None y la etapa
    # igual decía "con éxito"; ningún circuito quedaba documentado.
    sin_nada = _resumen_documentacion({"b1": None})
    assert "Sin documentación" in sin_nada
    assert "Documentador" in sin_nada


def test_sin_verificacion_no_dice_que_las_tensiones_no_coinciden():
    from agents.api import _resumen_verificacion

    assert "no coinciden" not in _resumen_verificacion({})
    assert "No se verificó" in _resumen_verificacion({})
