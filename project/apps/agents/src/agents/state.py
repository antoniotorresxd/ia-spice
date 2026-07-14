# project/apps/agents/src/agents/state.py
import operator
from typing import Annotated, TypedDict


def merge_dicts(left: dict | None, right: dict | None) -> dict:
    """Reducer: merge por clave de primer nivel (las claves son block_ids)."""
    return {**(left or {}), **(right or {})}


class CircuitState(TypedDict):
    # Entrada cruda del caller
    circuit_spec: dict

    # Escrito por 'orquestador'
    normalized_spec: dict | None
    pending_blocks: list | None

    # Escrito por los workers de 'calculo' (en paralelo) y mutado por 'curador'
    component_values: Annotated[dict, merge_dicts]

    # Escrito por 'sintesis', keyed por block_id; merge para conservar los
    # bloques no re-sintetizados en iteraciones posteriores
    netlists: Annotated[dict, merge_dicts]
    sim_results: Annotated[dict, merge_dicts]

    # Escrito por 'curador'
    iteration: int
    history: Annotated[list, operator.add]
    verdict: dict | None
