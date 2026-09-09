"""Documentación por LLM del netlist final de cada bloque.

La explicación acompaña al circuito sin intervenir en el veredicto: cualquier
fallo deja al bloque sin documentación y conserva el resultado de la corrida.
"""

from langchain_core.runnables import RunnableConfig

from agents.documentador.schema import CircuitDocumentation
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.state import CircuitState

# El agente al que corresponde este nodo, para pedir su configuración de LLM.
AGENT_ID = "documenter"


def get_chat_model(user_id: str):
    """Resuelve el LLM del documentador para el usuario de la corrida y construye
    el chat model.

    Punto de indirección a nivel de módulo: los tests lo sustituyen (monkeypatch)
    por un fake para no depender de red ni del server.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


_SYSTEM_PROMPT = """\
Eres un diseñador de circuitos analógicos. Recibes el netlist SPICE final de
un bloque y el resultado de su simulación. Explica el circuito en español.

- Resume qué hace el circuito y devuelve tags cortos de topología o categoría.
- Explica el rol de cada componente usando su nombre exacto en el netlist.
- Explica qué mide el bloque .meas o la salida de medición, si existe.
- Si la simulación falló, explica esa limitación sin inventar valores medidos.
- No inventes componentes ni modifiques el netlist.
"""


def _resultado_medicion(metric: str, measured: float | None, sim_error: str | None) -> str:
    if sim_error is not None:
        return f"La simulación falló: {sim_error}"
    return f"Se midió {metric} = {measured}"


def documentador_node(state: CircuitState, config: RunnableConfig | None = None) -> dict:
    """Documenta una vez cada bloque con netlist, sin hacer fallar la corrida."""
    blocks = [
        block for block in state["normalized_spec"]["blocks"]
        if block["id"] in state["netlists"]
    ]
    documentation = {block["id"]: None for block in blocks}
    user_id = (config or {}).get("configurable", {}).get("user_id")

    try:
        if not user_id:
            raise LlmSettingsError("missing user_id in run config")
        chat_model = get_chat_model(user_id)
    except LlmSettingsError:
        return {"documentation": documentation}
    except Exception:  # noqa: BLE001 - construir el modelo también puede fallar
        return {"documentation": documentation}

    for block in blocks:
        block_id = block["id"]
        try:
            netlist = state["netlists"][block_id]["text"]
            description = block["params"].get("description") or block["type"]
            metric = block["goal"]["metric"]
            sim_result = state["sim_results"].get(block_id) or {}
            measured = (sim_result.get("metrics") or {}).get(metric)
            user_content = (
                f"Circuito: {description}\n"
                f"{_resultado_medicion(metric, measured, sim_result.get('sim_error'))}\n\n"
                f"Netlist final:\n{netlist}"
            )
            result = chat_model.with_structured_output(CircuitDocumentation).invoke(
                [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ]
            )
            if not isinstance(result, CircuitDocumentation):
                raise TypeError(f"LLM returned unexpected type: {type(result)}")

            real_names = set()
            for line in netlist.splitlines():
                line = line.strip()
                if not line or line.startswith(("*", ".")):
                    continue
                name = line.split()[0]
                if name[0].upper() in "RCVDLX":
                    real_names.add(name)
            filtered_components = {
                name: role for name, role in result.components.items() if name in real_names
            }
            documentation[block_id] = {
                "summary": result.summary,
                "tags": result.tags,
                "components": filtered_components,
                "measurement_explanation": result.measurement_explanation,
            }
        except Exception:  # noqa: BLE001 - la documentación nunca invalida el circuito
            documentation[block_id] = None

    return {"documentation": documentation}
