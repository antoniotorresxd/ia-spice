"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

from fastapi import FastAPI

app = FastAPI(title="agents")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
