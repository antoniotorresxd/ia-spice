"""Documentación por LLM del netlist final de cada bloque.

La explicación acompaña al circuito sin intervenir en el veredicto: cualquier
fallo deja al bloque sin documentación y conserva el resultado de la corrida.
"""

import json

from langchain_core.runnables import RunnableConfig

from agents.documentador.schema import CircuitDocumentation
from agents.llm.factory import build_chat_model
from agents.llm.prompts import fetch_prompt
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.state import CircuitState

# El agente al que corresponde este nodo, para pedir su configuración de LLM.
AGENT_ID = "documenter"

# Lo que piden los campos nuevos viaja con el código, no en el prompt de
# Langfuse: así el prompt versionado allá sigue sirviendo sin tocarlo.
GUIA_DOCUMENTADOR = """## Resumen para el chat y paso a paso del diseño
Además de los campos de siempre, llena:
- `chat_summary`: 2 a 4 frases en Markdown, primera persona, para el chat. Qué circuito
  diseñaste, qué midió la simulación frente al objetivo (con unidades y el error) y si
  quedó dentro de tolerancia. Sin nombres internos como `gain_at_freq` ni ids de bloque.
- `design_walkthrough`: el paso a paso de cómo se diseñó, en Markdown con secciones
  numeradas y fórmulas LaTeX ($...$ en línea, $$...$$ en bloque):
  1. Requisito: qué se pidió (métrica, objetivo, tolerancia).
  2. Topología y por qué cumple el requisito.
  3. Ecuaciones de diseño y cómo se despejan los componentes.
  4. Valores ideales calculados y cómo se llevaron a valores comerciales (serie, error).
  5. Simulación: qué midió ngspice y el error frente al objetivo.
  6. Iteraciones: si hubo más de una, qué cambió entre ellas y por qué se aceptó.
  Usa SOLO los números de "Datos del diseño"; no inventes valores ni mediciones. Si un
  dato no está, omite ese paso en vez de suponerlo."""


def get_chat_model(user_id: str):
    """Resuelve el LLM del documentador para el usuario de la corrida y construye
    el chat model.

    Punto de indirección a nivel de módulo: los tests lo sustituyen (monkeypatch)
    por un fake para no depender de red ni del server.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


def _resultado_medicion(metric: str, measured: float | None, sim_error: str | None) -> str:
    if sim_error is not None:
        return f"La simulación falló: {sim_error}"
    return f"Se midió {metric} = {measured}"


def _json(valor) -> str:
    return json.dumps(valor, ensure_ascii=False, default=str)


def _datos_del_diseno(state: CircuitState, block: dict) -> str:
    """Lo que de verdad pasó con el bloque, para que el paso a paso no se invente.

    Requisitos, valores ideales y comerciales, la lista de materiales y una
    línea por iteración del curador con lo que midió y lo que decidió.
    """
    block_id = block["id"]
    lineas = ["Datos del diseño:"]
    requisitos = block.get("requirements") or ([block["goal"]] if block.get("goal") else [])
    if requisitos:
        lineas.append(f"- Requisitos: {_json(requisitos)}")
    for clave, titulo in (
        ("component_values", "Valores ideales calculados"),
        ("commercial_values", "Valores comerciales simulados"),
    ):
        valores = (state.get(clave) or {}).get(block_id)
        if valores:
            lineas.append(f"- {titulo}: {_json(valores)}")
    bom = (state.get("bom") or {}).get(block_id)
    if bom:
        lineas.append(f"- Lista de materiales: {_json(bom)}")
    historial = state.get("history") or []
    if historial:
        lineas.append("- Iteraciones del curador:")
        for k, registro in enumerate(historial):
            metricas = ((registro.get("sim_results") or {}).get(block_id) or {}).get("metrics") or {}
            medido = ", ".join(f"{m} = {v}" for m, v in metricas.items()) or "sin medición"
            lineas.append(f"  - iteración {k + 1}: {registro.get('decision', '?')} ({medido})")
    return "\n".join(lineas) if len(lineas) > 1 else ""


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
        system_prompt = fetch_prompt("documentador-system") + "\n\n" + GUIA_DOCUMENTADOR
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
            datos = _datos_del_diseno(state, block)
            user_content = (
                f"Circuito: {description}\n"
                f"{_resultado_medicion(metric, measured, sim_result.get('sim_error'))}\n\n"
                + (f"{datos}\n\n" if datos else "")
                + f"Netlist final:\n{netlist}"
            )
            result = chat_model.with_structured_output(CircuitDocumentation).invoke(
                [
                    {"role": "system", "content": system_prompt},
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
                "chat_summary": result.chat_summary,
                "design_walkthrough": result.design_walkthrough,
            }
        except Exception:  # noqa: BLE001 - la documentación nunca invalida el circuito
            documentation[block_id] = None

    return {"documentation": documentation}
