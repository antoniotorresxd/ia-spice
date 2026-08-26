import os

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from agents.api import app
from agents.checkpointer import checkpointer_url, open_checkpointer, setup
from agents.graph import build_graph

TOKEN = "token-de-prueba-suficientemente-largo"
DIVISOR = {
    "blocks": [
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
    ]
}


@pytest.fixture(autouse=True)
def _entorno(monkeypatch):
    monkeypatch.setenv("AGENTS_API_TOKEN", TOKEN)
    monkeypatch.delenv("CHECKPOINTER_URL", raising=False)


def test_sin_url_configurada_cae_a_memoria():
    """Degradar a memoria es deliberado: desarrollo y pruebas no deberían
    exigir una base. Lo que se pierde es la recuperabilidad, no el resultado."""
    with open_checkpointer() as saver:
        assert isinstance(saver, MemorySaver)


def test_checkpointer_url_vacia_cuenta_como_ausente(monkeypatch):
    monkeypatch.setenv("CHECKPOINTER_URL", "")

    assert checkpointer_url() is None


def test_setup_sin_url_falla_en_lugar_de_no_hacer_nada(monkeypatch):
    monkeypatch.delenv("CHECKPOINTER_URL", raising=False)

    with pytest.raises(RuntimeError, match="CHECKPOINTER_URL"):
        setup()


def test_build_graph_usa_el_checkpointer_que_se_le_inyecta():
    propio = MemorySaver()
    graph = build_graph(propio)

    graph.invoke(
        {
            "circuit_spec": DIVISOR,
            "request_text": None,
            "normalized_spec": None,
            "pending_blocks": None,
            "component_values": {},
            "netlists": {},
            "sim_results": {},
            "iteration": 0,
            "history": [],
            "verdict": None,
        },
        config={"configurable": {"thread_id": "hilo-propio"}},
    )

    # el estado quedó en el checkpointer que pasamos, no en uno interno
    guardado = propio.get({"configurable": {"thread_id": "hilo-propio"}})
    assert guardado is not None


def test_el_execution_id_es_el_hilo_del_checkpoint():
    """Es lo que hace retomable una ejecución: reenviarla con el mismo
    execution_id continúa desde su checkpoint en lugar de empezar de cero.

    Antes se generaba un uuid nuevo por petición y además se reconstruía el
    grafo, así que ninguna corrida podía retomarse jamás.
    """
    client = TestClient(app)

    respuesta = client.post(
        "/runs",
        json={"user_id": "u", "circuit_spec": DIVISOR, "execution_id": "exec-abc"},
        headers={"authorization": f"Bearer {TOKEN}"},
    )
    assert respuesta.status_code == 200

    estado = app.state.graph.get_state({"configurable": {"thread_id": "exec-abc"}})

    assert estado.values["verdict"]["status"] == "accepted"
    assert estado.values["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(3.3, rel=0.05)


def test_sin_execution_id_la_corrida_sigue_funcionando():
    """El campo es opcional: una corrida sin él funciona igual, solo que no
    será retomable."""
    client = TestClient(app)

    respuesta = client.post(
        "/runs",
        json={"user_id": "u", "circuit_spec": DIVISOR},
        headers={"authorization": f"Bearer {TOKEN}"},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["verdict"]["status"] == "accepted"


# --- Integración real contra Postgres -------------------------------------
# Necesita las dos variables o se salta, y un test saltado no prueba nada:
#   RUN_PG_TESTS=1 CHECKPOINTER_URL=postgresql://... uv run pytest
# Se captura al importar: el fixture autouse borra la variable del entorno
# antes de cada prueba, para que las demas no vean una base por accidente.
_PG_URL = os.environ.get("CHECKPOINTER_URL")
_run_pg = os.environ.get("RUN_PG_TESTS") == "1" and bool(_PG_URL)
pg = pytest.mark.skipif(not _run_pg, reason="requiere RUN_PG_TESTS=1 y CHECKPOINTER_URL")


@pg
def test_el_estado_sobrevive_al_proceso(monkeypatch):
    """La prueba de la recuperabilidad (RNF-03.2): se corre el grafo, se cierra
    el checkpointer por completo, se abre otro nuevo —como haría un proceso
    reiniciado— y el estado sigue ahí."""
    monkeypatch.setenv("CHECKPOINTER_URL", _PG_URL)
    setup()

    hilo = f"hilo-persistente-{os.getpid()}"
    inicial = {
        "circuit_spec": DIVISOR,
        "request_text": None,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    with open_checkpointer() as saver:
        build_graph(saver).invoke(inicial, config={"configurable": {"thread_id": hilo}})

    # otro checkpointer, otra conexión: el proceso anterior ya no existe
    with open_checkpointer() as otro:
        estado = build_graph(otro).get_state({"configurable": {"thread_id": hilo}})

    assert estado.values["verdict"]["status"] == "accepted"
    assert estado.values["history"], "el historial no sobrevivió"


def test_el_esquema_se_lee_de_la_cadena_de_conexion():
    """Aislar el checkpointer en su propio esquema es lo que evita que Drizzle
    y LangGraph se peleen por las mismas tablas."""
    from agents.checkpointer import schema_from_url

    con_esquema = "postgresql://u:p@h/d?options=-c%20search_path%3Dagents"
    assert schema_from_url(con_esquema) == "agents"


def test_sin_search_path_no_hay_esquema_y_se_usa_el_de_por_defecto():
    from agents.checkpointer import schema_from_url

    assert schema_from_url("postgresql://u:p@h/d") is None
    assert schema_from_url("postgresql://u:p@h/d?sslmode=require") is None


def test_un_search_path_que_no_es_identificador_se_rechaza(monkeypatch):
    """El valor sale de una variable nuestra, pero acaba interpolado en un
    CREATE SCHEMA: se comprueba antes de construir el DDL."""
    monkeypatch.setenv(
        "CHECKPOINTER_URL", "postgresql://u:p@h/d?options=-c%20search_path%3Dagents%22%3B--"
    )

    with pytest.raises(RuntimeError, match="identificador"):
        setup()
