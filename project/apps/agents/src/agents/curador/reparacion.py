"""Reparación de un netlist genérico por LLM.

Los tipos curados se ajustan con ecuaciones exactas. Un circuito fuera del
catálogo no tiene ecuación que aplicar, así que se le pide al modelo que
corrija su propio trabajo — dándole la meta y lo que ngspice midió de verdad.

Lo que no cambia es quién decide: el netlist corregido se vuelve a simular y a
medir. Que el modelo diga que lo arregló no cuenta.
"""

from pydantic import BaseModel, model_validator

from agents.llm.factory import build_chat_model
from agents.llm.settings_client import fetch_agent_llm

# El agente al que corresponde este nodo, para pedir su configuración de LLM.
AGENT_ID = "curator"


def get_chat_model(user_id: str):
    """Resuelve el LLM del curador para el usuario de la corrida y construye
    el chat model.

    Punto de indirección a nivel de módulo, igual que en el orquestador: los
    tests lo sustituyen (monkeypatch) por un fake para no depender de red ni
    del server.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


class NetlistReparado(BaseModel):
    """Salida estructurada de la reparación: solo el netlist corregido.

    Misma guarda que `GenericParams` en `orquestador/schema.py` y por la misma
    razón: un netlist que no escribe su medición en output.txt, o que no trae
    un bloque .control, deja al shell sin nada que leer.
    """

    netlist: str

    @model_validator(mode="after")
    def _el_netlist_mide_algo(self):
        if "output.txt" not in self.netlist:
            raise ValueError(
                "el netlist debe escribir su medición en output.txt "
                "(wrdata output.txt ..., o echo $&var > output.txt)"
            )
        if ".control" not in self.netlist:
            raise ValueError("el netlist debe traer un bloque .control que ejecute el análisis")
        return self


class ReparacionError(Exception):
    """El LLM no produjo un netlist reparado válido."""


_SYSTEM_PROMPT = """\
Eres un diseñador de circuitos analógicos. Recibes un netlist SPICE que no
alcanza su meta y debes corregirlo.

- Devuelve el netlist COMPLETO corregido, nunca un diff ni una explicación.
- Conserva el bloque .control y que la medición se escriba en output.txt.
- Cambia solo lo necesario para acercar la magnitud medida a la meta.
- Si la simulación falló, corrige el error de sintaxis o de convergencia antes
  de preocuparte por la meta.
"""


def _resultado_medicion(metric: str, measured: float | None, sim_error: str | None) -> str:
    if sim_error is not None:
        return f"La simulación falló: {sim_error}"
    return f"Se midió {metric} = {measured}"


def repair_netlist(
    chat_model,
    *,
    description: str,
    metric: str,
    target: float,
    netlist: str,
    measured: float | None,
    sim_error: str | None,
) -> str:
    """Le pide al modelo un netlist corregido, dado lo que se midió (o el
    error de simulación) contra la meta declarada.

    Devuelve el netlist corregido como texto. Cualquier fallo del modelo se
    tipa como `ReparacionError`, igual que `extract_circuit_spec` tipa los
    suyos como `ExtractionError`.
    """
    user_content = (
        f"Circuito: {description}\n"
        f"Meta: {metric} = {target}\n"
        f"{_resultado_medicion(metric, measured, sim_error)}\n\n"
        f"Netlist actual:\n{netlist}"
    )

    structured_model = chat_model.with_structured_output(NetlistReparado)
    try:
        result = structured_model.invoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ]
        )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        raise ReparacionError(f"LLM repair failed: {exc}") from exc

    if not isinstance(result, NetlistReparado):
        raise ReparacionError(f"LLM returned unexpected type: {type(result)}")

    return result.netlist
