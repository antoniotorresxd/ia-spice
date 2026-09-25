"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

import json
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from langfuse.langchain import CallbackHandler
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
        app.state.langfuse_handler = _langfuse_handler()
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


def _langfuse_handler() -> CallbackHandler | None:
    """El handler del proceso, creado al arrancar o al vuelo en tests.

    Sin las claves de Langfuse la observabilidad queda desactivada.
    """
    if not hasattr(app.state, "langfuse_handler"):
        handler = None
        if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
            handler = CallbackHandler()
        app.state.langfuse_handler = handler
    return app.state.langfuse_handler


class RunRequest(BaseModel):
    user_id: str
    request_text: str | None = None
    circuit_spec: dict | None = None
    # Identidad estable de la corrida. Es lo que permite retomar una ejecución
    # interrumpida: reenviarla con el mismo execution_id continúa desde el
    # último checkpoint en lugar de empezar de cero. Sin él se genera uno
    # nuevo, y esa corrida no será retomable.
    execution_id: str | None = None
    max_iterations: int | None = None
    tolerance: float | None = None


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


@app.get("/version")
def version() -> dict:
    return {"version": "0.1.0"}


@app.post("/runs")
def create_run(
    body: RunRequest,
    authorization: str | None = Header(default=None),
    accept: str | None = Header(default=None),
):
    _require_token(authorization)

    if body.request_text is None and body.circuit_spec is None:
        raise HTTPException(status_code=400, detail="request_text or circuit_spec is required")

    spec_dict = dict(body.circuit_spec) if body.circuit_spec else {}
    if body.max_iterations is not None:
        spec_dict["max_iterations"] = body.max_iterations
    if body.tolerance is not None:
        spec_dict["tolerance"] = body.tolerance

    initial_state = {
        "circuit_spec": spec_dict,
        "request_text": body.request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "documentation": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
        "outcome": None,
    }

    # user_id viaja en el config, no en el estado: es identidad de la corrida,
    # no un dato del circuito. El thread_id es la ejecución que abrió el
    # servidor, de modo que reenviarla retoma su checkpoint.
    thread_id = body.execution_id or str(uuid.uuid4())
    configurable = {
        "user_id": body.user_id,
        "thread_id": thread_id,
    }
    if body.max_iterations is not None:
        configurable["max_iterations"] = body.max_iterations
    if body.tolerance is not None:
        configurable["tolerance"] = body.tolerance
    config = {"configurable": configurable}
    handler = _langfuse_handler()
    if handler is not None:
        config["callbacks"] = [handler]
        config["metadata"] = {
            "langfuse_session_id": thread_id,
            "langfuse_user_id": body.user_id,
        }

    if accept and isinstance(accept, str) and "text/event-stream" in accept:
        return StreamingResponse(
            _stream_run(initial_state, config),
            media_type="text/event-stream",
        )

    final_state = _graph().invoke(
        initial_state,
        config=config,
    )

    return {
        "verdict": final_state["verdict"],
        "outcome": final_state["outcome"],
        "normalized_spec": final_state["normalized_spec"],
        "netlists": final_state["netlists"],
        "sim_results": final_state["sim_results"],
        "documentation": final_state["documentation"],
        "component_values": final_state["component_values"],
        "history": final_state["history"],
        "iteration": final_state["iteration"],
    }


STAGES_META = {
    "interpretation": {"label": "Interpretación", "actor": "Orquestador"},
    "calculation": {"label": "Cálculo", "actor": "Cálculo"},
    "simulation": {"label": "Simulación", "actor": "Simulación"},
    "curation": {"label": "Curación", "actor": "Curador"},
    "result": {"label": "Documentación", "actor": "Documentador"},
}


def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _stream_run(initial_state: dict, config: dict):
    stage_start_times: dict[str, float] = {}

    def _stage_event(
        kind: str,
        status: str,
        summary: str,
        duration_ms: int | None = None,
        metrics: list | None = None,
    ) -> str:
        meta = STAGES_META.get(kind, {"label": kind.capitalize(), "actor": "Agente"})
        return _sse(
            "stage",
            {
                "id": f"stage-{kind}",
                "kind": kind,
                "label": meta["label"],
                "actor": meta["actor"],
                "status": status,
                "durationMs": duration_ms,
                "summary": summary,
                "metrics": metrics or [],
            },
        )

    stage_start_times["interpretation"] = time.perf_counter()
    yield _stage_event(
        "interpretation",
        status="active",
        summary="Interpretando solicitud y requerimientos...",
    )

    graph = _graph()

    try:
        for chunk in graph.stream(initial_state, config=config, stream_mode="updates"):
            for node, update in chunk.items():
                if node == "orquestador":
                    dur = int(
                        (time.perf_counter() - stage_start_times.get("interpretation", time.perf_counter()))
                        * 1000
                    )
                    verdict = update.get("verdict")
                    outcome = update.get("outcome")

                    if verdict and verdict.get("status") == "rejected":
                        yield _stage_event(
                            "interpretation",
                            status="failed",
                            duration_ms=dur,
                            summary=verdict.get("reason", "Solicitud rechazada."),
                        )
                    elif outcome and outcome.get("mode") in ("chat", "clarify"):
                        summary = outcome.get("reply") or outcome.get("question") or "Consulta respondida."
                        yield _stage_event(
                            "interpretation",
                            status="completed",
                            duration_ms=dur,
                            summary=summary,
                        )
                    else:
                        yield _stage_event(
                            "interpretation",
                            status="completed",
                            duration_ms=dur,
                            summary="Especificación normalizada con éxito.",
                        )
                        stage_start_times["calculation"] = time.perf_counter()
                        yield _stage_event(
                            "calculation",
                            status="active",
                            summary="Calculando valores de componentes...",
                        )

                elif node == "calculo":
                    dur = int(
                        (time.perf_counter() - stage_start_times.get("calculation", time.perf_counter()))
                        * 1000
                    )
                    yield _stage_event(
                        "calculation",
                        status="completed",
                        duration_ms=dur,
                        summary="Valores de componentes comerciales determinados.",
                    )
                    stage_start_times["simulation"] = time.perf_counter()
                    yield _stage_event(
                        "simulation",
                        status="active",
                        summary="Generando netlist y simulando con NGSpice...",
                    )

                elif node == "sintesis":
                    dur = int(
                        (time.perf_counter() - stage_start_times.get("simulation", time.perf_counter()))
                        * 1000
                    )
                    yield _stage_event(
                        "simulation",
                        status="completed",
                        duration_ms=dur,
                        summary="Simulación SPICE completada.",
                    )
                    stage_start_times["curation"] = time.perf_counter()
                    yield _stage_event(
                        "curation",
                        status="active",
                        summary="Curador evaluando tolerancias y resultados...",
                    )

                elif node == "curador":
                    dur = int(
                        (time.perf_counter() - stage_start_times.get("curation", time.perf_counter()))
                        * 1000
                    )
                    verdict = update.get("verdict")
                    iteration = update.get("iteration", 0)

                    if verdict is None:
                        yield _stage_event(
                            "curation",
                            status="active",
                            duration_ms=dur,
                            summary=f"Curador: iteración {iteration} fuera de tolerancia. Ajustando componentes...",
                        )
                        stage_start_times["simulation"] = time.perf_counter()
                        yield _stage_event(
                            "simulation",
                            status="active",
                            summary=f"Re-simulando circuito tras ajuste (iteración {iteration + 1})...",
                        )
                    else:
                        is_accepted = verdict.get("status") == "accepted"
                        yield _stage_event(
                            "curation",
                            status="completed" if is_accepted else "failed",
                            duration_ms=dur,
                            summary=verdict.get("reason", "Evaluación terminada."),
                        )
                        if is_accepted:
                            stage_start_times["result"] = time.perf_counter()
                            yield _stage_event(
                                "result",
                                status="active",
                                summary="Generando documentación técnica del circuito...",
                            )

                elif node == "documentador":
                    dur = int(
                        (time.perf_counter() - stage_start_times.get("result", time.perf_counter()))
                        * 1000
                    )
                    yield _stage_event(
                        "result",
                        status="completed",
                        duration_ms=dur,
                        summary="Documentación generada con éxito.",
                    )

        snapshot = graph.get_state(config)
        final_state = snapshot.values if snapshot else {}

        run_result = {
            "verdict": final_state.get("verdict"),
            "outcome": final_state.get("outcome"),
            "normalized_spec": final_state.get("normalized_spec"),
            "netlists": final_state.get("netlists", {}),
            "sim_results": final_state.get("sim_results", {}),
            "documentation": final_state.get("documentation"),
            "component_values": final_state.get("component_values", {}),
            "history": final_state.get("history", []),
            "iteration": final_state.get("iteration", 0),
        }
        yield _sse("done", run_result)

    except Exception as exc:
        yield _sse("error", {"error": str(exc)})


@app.post("/runs/stream")
def create_run_stream(body: RunRequest, authorization: str | None = Header(default=None)):
    _require_token(authorization)

    if body.request_text is None and body.circuit_spec is None:
        raise HTTPException(status_code=400, detail="request_text or circuit_spec is required")

    spec_dict = body.circuit_spec or {}
    if body.max_iterations is not None:
        spec_dict["max_iterations"] = body.max_iterations
    if body.tolerance is not None:
        spec_dict["tolerance"] = body.tolerance

    initial_state = {
        "circuit_spec": spec_dict,
        "request_text": body.request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "documentation": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
        "outcome": None,
    }

    thread_id = body.execution_id or str(uuid.uuid4())
    configurable = {
        "user_id": body.user_id,
        "thread_id": thread_id,
    }
    if body.max_iterations is not None:
        configurable["max_iterations"] = body.max_iterations
    if body.tolerance is not None:
        configurable["tolerance"] = body.tolerance
    config = {"configurable": configurable}
    handler = _langfuse_handler()
    if handler is not None:
        config["callbacks"] = [handler]
        config["metadata"] = {
            "langfuse_session_id": thread_id,
            "langfuse_user_id": body.user_id,
        }

    return StreamingResponse(
        _stream_run(initial_state, config),
        media_type="text/event-stream",
    )


def _langfuse_client():
    if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
        try:
            from langfuse import Langfuse
            return Langfuse()
        except Exception:
            return None
    return None


@app.get("/runs/{execution_id}/trace")
def get_run_trace(execution_id: str, authorization: str | None = Header(default=None)):
    _require_token(authorization)
    client = _langfuse_client()
    if client is None:
        return {
            "traceId": execution_id,
            "sessionId": execution_id,
            "status": "unavailable",
            "message": "Observabilidad de Langfuse no configurada en el servidor.",
            "steps": [],
        }

    try:
        traces_res = client.api.trace.list(session_id=execution_id, limit=5)
        trace_summary = traces_res.data[0] if traces_res.data else None

        if trace_summary is None:
            try:
                trace_detail = client.api.trace.get(trace_id=execution_id)
            except Exception:
                return {
                    "traceId": execution_id,
                    "sessionId": execution_id,
                    "status": "pending",
                    "message": "Traza aún en proceso de indexación en Langfuse.",
                    "steps": [],
                }
        else:
            trace_detail = client.api.trace.get(trace_id=trace_summary.id)

        steps = []
        for obs in (trace_detail.observations or []):
            dur = None
            if obs.end_time and obs.start_time:
                dur = round((obs.end_time - obs.start_time).total_seconds(), 3)
            steps.append({
                "id": obs.id,
                "name": obs.name or obs.type,
                "type": obs.type,
                "model": obs.model,
                "startTime": obs.start_time.isoformat() if obs.start_time else None,
                "endTime": obs.end_time.isoformat() if obs.end_time else None,
                "durationSec": dur,
                "input": obs.input,
                "output": obs.output,
                "usage": {
                    "promptTokens": obs.usage.prompt_tokens if obs.usage else None,
                    "completionTokens": obs.usage.completion_tokens if obs.usage else None,
                    "totalTokens": obs.usage.total_tokens if obs.usage else None,
                } if obs.usage else None,
                "level": str(obs.level) if obs.level else "DEFAULT",
                "statusMessage": obs.status_message,
            })

        return {
            "traceId": trace_detail.id,
            "sessionId": trace_detail.session_id or execution_id,
            "timestamp": trace_detail.timestamp.isoformat() if trace_detail.timestamp else None,
            "latency": trace_detail.latency,
            "totalCost": trace_detail.total_cost,
            "status": "ready",
            "steps": steps,
        }
    except Exception as exc:
        return {
            "traceId": execution_id,
            "sessionId": execution_id,
            "status": "error",
            "message": f"No se pudo consultar la traza en Langfuse: {exc}",
            "steps": [],
        }


