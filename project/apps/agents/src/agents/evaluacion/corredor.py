"""Ejecuta el grafo real sobre cada caso del banco.

Entra por `circuit_spec` estructurado, no por lenguaje natural, para que la
medición del sistema no dependa de tener un LLM configurado ni herede su
variabilidad. La línea base best-of-N sí usa la descripción.
"""

from agents.evaluacion.metricas import ape
from agents.graph import build_graph


def _estado_inicial(circuit_spec: dict) -> dict:
    return {
        "circuit_spec": circuit_spec,
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


def resultado_desde_estado(caso: dict, estado: dict) -> dict:
    """Normaliza el estado final del grafo al registro que consumen las
    métricas. Función pura: separada de `correr_caso` para poder probarla sin
    ejecutar ngspice."""
    referencia = caso["referencia"]
    objetivo = referencia["objetivo"]
    block_id = caso["spec"]["blocks"][0]["id"]
    tipo = caso["spec"]["blocks"][0]["type"]

    sim = (estado.get("sim_results") or {}).get(block_id) or {}
    metrics = sim.get("metrics")
    medido = metrics.get(referencia["metrica"]) if metrics else None

    tolerancia = estado["normalized_spec"]["blocks"][0]["goal"]["tolerance"]

    error = ape(medido, objetivo) if medido is not None else None
    # La tolerancia viaja como fracción (0.05) y el APE en puntos (5.0).
    en_tolerancia = error is not None and error <= tolerancia * 100.0

    verdict = estado.get("verdict") or {}

    return {
        "id": caso["id"],
        "tipo": tipo,
        "estado": verdict.get("status", "error"),
        "medido": medido,
        "objetivo": objetivo,
        "ape": error,
        "en_tolerancia": en_tolerancia,
        "iteraciones": estado.get("iteration", 0) + 1,
        "razon": verdict.get("reason", ""),
    }


def correr_caso(caso: dict) -> dict:
    graph = build_graph()
    estado = graph.invoke(
        _estado_inicial(caso["spec"]),
        config={"configurable": {"thread_id": f"eval-{caso['id']}"}},
    )
    return resultado_desde_estado(caso, estado)


def correr_banco(casos: list[dict]) -> list[dict]:
    return [correr_caso(caso) for caso in casos]
