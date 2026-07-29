"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

import os
import secrets
import uuid

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from agents.graph import build_graph

app = FastAPI(title="agents")


class RunRequest(BaseModel):
    user_id: str
    request_text: str | None = None
    circuit_spec: dict | None = None


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

    graph = build_graph()

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
    # no un dato del circuito. thread_id lo exige el MemorySaver.
    final_state = graph.invoke(
        initial_state,
        config={"configurable": {"user_id": body.user_id, "thread_id": str(uuid.uuid4())}},
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
