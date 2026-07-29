"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

import os
import secrets
import uuid

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

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

    return {"verdict": None}
