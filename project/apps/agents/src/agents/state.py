# project/apps/agents/src/agents/state.py
import operator
from typing import Annotated, TypedDict


def merge_dicts(left: dict | None, right: dict | None) -> dict:
    """Reducer: merge por clave de primer nivel (las claves son block_ids)."""
    return {**(left or {}), **(right or {})}


class CircuitState(TypedDict):
    # Entrada cruda del caller (uno de los dos, o ambos — ver orquestador)
    circuit_spec: dict
    request_text: str | None
    # Imágenes adjuntas al mensaje del turno (la figura del enunciado), como
    # [{"media_type", "data" (base64)}]. Solo las lee el orquestador; None
    # cuando el turno no trae ninguna.
    images: list | None

    # Autocorrección del planteamiento (modo análisis). `correccion_analisis`
    # la deja 'analisis' cuando el motor no pudo resolver o ngspice no
    # reproduce lo transcrito: {"anterior": json del planteamiento, "error":
    # texto}; el orquestador la consume y la vuelve None. `correcciones_hechas`
    # guarda los errores que motivaron cada reintento, para el informe y para
    # acotar los reintentos.
    correccion_analisis: dict | None
    correcciones_hechas: list | None

    # Escrito por 'orquestador'
    normalized_spec: dict | None
    pending_blocks: list | None

    # Escrito por 'orquestador' cuando el mensaje no llega a ser un diseño:
    # charla (mode="chat") o falta información (mode="clarify", con lo que
    # ya se pudo inferir en partial_spec). None en el camino de diseño.
    outcome: dict | None

    # Escrito por los workers de 'calculo' (en paralelo) y mutado por 'curador'
    component_values: Annotated[dict, merge_dicts]

    # Escrito por 'escritura', keyed por block_id: lo que de verdad se simula
    # (component_values aterrizados a series E) y la lista de materiales que
    # explica cada redondeo. component_values sigue siendo el valor continuo
    # que ajusta el curador; ver agents/comerciales.
    commercial_values: Annotated[dict, merge_dicts]
    bom: Annotated[dict, merge_dicts]
    # Escrito por 'curador', keyed por block_id: cuántos pasos de
    # `comerciales.escalamiento` se le concedieron a un bloque cuyo lazo
    # oscilaba entre valores comerciales. Ausente = 0 (precisión base).
    precision: Annotated[dict, merge_dicts]

    # Escrito por 'sintesis', keyed por block_id; merge para conservar los
    # bloques no re-sintetizados en iteraciones posteriores
    netlists: Annotated[dict, merge_dicts]
    sim_results: Annotated[dict, merge_dicts]

    # Escrito por 'documentador', keyed por block_id
    documentation: Annotated[dict, merge_dicts]

    # Escrito por 'curador'
    iteration: int
    history: Annotated[list, operator.add]
    verdict: dict | None
