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


def _tolerance_for(normalized_block: dict, metrica: str) -> float:
    for requirement in normalized_block["requirements"]:
        if requirement["measure"] == metrica:
            return requirement["tolerance"]
    # Inalcanzable si el banco está bien formado: el objetivo de una
    # referencia siempre corresponde a un requisito real de su bloque.
    raise KeyError(f"ningún requisito de {normalized_block['id']} mide '{metrica}'")


def resultado_desde_estado(caso: dict, estado: dict) -> list[dict]:
    """Normaliza el estado final del grafo a un registro POR REQUISITO (no
    por caso): un caso con dos requisitos, o con `connections`, produce dos
    filas. Función pura: separada de `correr_caso` para poder probarla sin
    ejecutar ngspice."""
    blocks_by_id = {b["id"]: b for b in caso["spec"]["blocks"]}
    normalized_blocks = {b["id"]: b for b in estado["normalized_spec"]["blocks"]}
    verdict = estado.get("verdict") or {}
    sim_results = estado.get("sim_results") or {}
    iteraciones = estado.get("iteration", 0) + 1

    resultados = []
    for requisito in caso["referencia"]:
        block_id = requisito["requisito"]
        objetivo = requisito["objetivo"]
        metrica = requisito["metrica"]
        tipo = blocks_by_id[block_id]["params"]["circuit_id"]

        sim = sim_results.get(block_id) or {}
        metrics = sim.get("metrics")
        medido = metrics.get(metrica) if metrics else None

        tolerancia = _tolerance_for(normalized_blocks[block_id], metrica)

        error = ape(medido, objetivo) if medido is not None else None
        # La tolerancia viaja como fracción (0.05) y el APE en puntos (5.0).
        en_tolerancia = error is not None and error <= tolerancia * 100.0

        resultados.append(
            {
                "id": f"{caso['id']}/{requisito['requisito']}" if len(caso["referencia"]) > 1 else caso["id"],
                "tipo": tipo,
                "estado": verdict.get("status", "error"),
                "medido": medido,
                "objetivo": objetivo,
                "ape": error,
                "en_tolerancia": en_tolerancia,
                "iteraciones": iteraciones,
                "razon": verdict.get("reason", ""),
            }
        )
    return resultados


def correr_caso(caso: dict) -> list[dict]:
    graph = build_graph()
    estado = graph.invoke(
        _estado_inicial(caso["spec"]),
        config={"configurable": {"thread_id": f"eval-{caso['id']}"}},
    )
    return resultado_desde_estado(caso, estado)


def correr_banco(casos: list[dict]) -> list[dict]:
    return [fila for caso in casos for fila in correr_caso(caso)]
