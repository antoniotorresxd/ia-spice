"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

import os
import secrets
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from agents.checkpointer import checkpointer_url, open_checkpointer
from agents.graph import build_graph


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Construye el grafo una sola vez, con el checkpointer del entorno.

    Antes se construía por petición, y además con un thread_id nuevo cada vez:
    con un checkpointer recién creado y un hilo distinto en cada corrida,
    ninguna ejecución podía retomarse jamás. La recuperabilidad era cero, no
    parcial.
    """
    with open_checkpointer() as checkpointer:
        app.state.graph = build_graph(checkpointer)
        app.state.persistente = checkpointer_url() is not None
        yield


app = FastAPI(title="agents", lifespan=lifespan)


def _graph():
    """El grafo del proceso.

    El lifespan lo deja listo al arrancar. Si no corrió —las pruebas montan
    TestClient sin él— se construye al vuelo con el checkpointer en memoria: el
    resultado del grafo es el mismo, solo que sin persistencia.
    """
    graph = getattr(app.state, "graph", None)
    if graph is None:
        graph = build_graph()
        app.state.graph = graph
    return graph


class RunRequest(BaseModel):
    user_id: str
    request_text: str | None = None
    circuit_spec: dict | None = None
    # Identidad estable de la corrida. Es lo que permite retomar una ejecución
    # interrumpida: reenviarla con el mismo execution_id continúa desde el
    # último checkpoint en lugar de empezar de cero. Sin él se genera uno
    # nuevo, y esa corrida no será retomable.
    execution_id: str | None = None


def _require_token(authorization: str | None) -> None:
    expected = os.environ.get("AGENTS_API_TOKEN")
    if not expected:
        # Sin token configurado no se sirve: aceptar sin autenticar sería peor.
        raise HTTPException(status_code=503, detail="AGENTS_API_TOKEN is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    provided = authorization[len("Bearer ") :]
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/runs")
def create_run(body: RunRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_token(authorization)

    if body.request_text is None and body.circuit_spec is None:
        raise HTTPException(status_code=400, detail="request_text or circuit_spec is required")

    initial_state = {
        "circuit_spec": body.circuit_spec or {},
        "request_text": body.request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    # user_id viaja en el config, no en el estado: es identidad de la corrida,
    # no un dato del circuito. El thread_id es la ejecución que abrió el
    # servidor, de modo que reenviarla retoma su checkpoint.
    thread_id = body.execution_id or str(uuid.uuid4())
    final_state = _graph().invoke(
        initial_state,
        config={"configurable": {"user_id": body.user_id, "thread_id": thread_id}},
    )

    return {
        "verdict": final_state["verdict"],
        "normalized_spec": final_state["normalized_spec"],
        "netlists": final_state["netlists"],
        "sim_results": final_state["sim_results"],
        "component_values": final_state["component_values"],
        "history": final_state["history"],
        "iteration": final_state["iteration"],
    }
