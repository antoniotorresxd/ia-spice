"""Documentación por LLM del netlist final de cada bloque.

La explicación acompaña al circuito sin intervenir en el veredicto: cualquier
fallo deja al bloque sin documentación y conserva el resultado de la corrida.
"""

import json
import re

from langchain_core.runnables import RunnableConfig

from agents.documentador.schema import CircuitDocumentation
from agents.llm.factory import build_chat_model
from agents.llm.prompts import fetch_prompt
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.llm.structured import invocar_estructurado
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
- `design_walkthrough`: el paso a paso de cómo se diseñó, como una memoria de cálculo.
  Sigue EXACTAMENTE esta forma (títulos `##` numerados, una idea por párrafo):

  ## 1. Requisito
  Qué se pidió: métrica, objetivo y tolerancia, en una o dos frases.

  ## 2. Topología
  Qué configuración se usó y por qué cumple el requisito.

  ## 3. Ecuaciones de diseño
  Cada ecuación importante va SOLA en su propio bloque, en una línea aparte:

  $$A_d = \\left(1 + \\frac{2R_1}{R_G}\\right)\\frac{R_4}{R_3}$$

  y debajo, en texto, cómo se despeja cada componente (más bloques $$...$$ si hace falta).

  ## 4. Valores de los componentes
  Una tabla Markdown: | Componente | Valor ideal | Valor comercial | Serie |

  ## 5. Simulación
  Qué midió ngspice, frente al objetivo, con el error en %.

  ## 6. Iteraciones
  Solo si hubo más de una: qué cambió entre ellas y por qué se aceptó.

  Reglas de notación: subíndices en LaTeX ($R_G$, $V_{out}$, nunca "RG" en una
  fórmula), unidades con espacio fino ($10\\,\\text{k}\\Omega$), paréntesis grandes con
  \\left( \\right). No metas ecuaciones largas dentro de una frase: van en $$...$$.
  Usa SOLO los números de "Datos del diseño"; no inventes valores ni mediciones. Si un
  dato no está, omite esa sección en vez de suponerlo."""


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


# "Requisito: ...", "**Ecuaciones:** ...", "4. Valores: ...": una etiqueta corta
# al inicio de línea, sin fórmulas, seguida de dos puntos.
_ETIQUETA = re.compile(
    r"^\s*(?:\d+[.)]\s*)?(?:\*\*)?([A-ZÁÉÍÓÚÑ][\wáéíóúñü ]{2,40}?)(?:\*\*:|:\*\*|:)\s*(.*)$"
)


def estructurar_paso_a_paso(texto: str) -> str:
    """Convierte las etiquetas sueltas en secciones `## n. Etiqueta`.

    La guía pide secciones, pero el modelo a veces responde con párrafos
    "Requisito: ...", "Ecuaciones: ..." que se leen como un bloque corrido.
    Si el texto ya trae títulos Markdown, se deja tal cual.
    """
    lineas = texto.strip().splitlines()
    if any(linea.lstrip().startswith("#") for linea in lineas):
        return texto
    prefacio: list[str] = []
    secciones: list[tuple[str, list[str]]] = []
    for linea in lineas:
        m = _ETIQUETA.match(linea)
        if m:
            secciones.append((m.group(1).strip(), [m.group(2)] if m.group(2) else []))
        elif secciones:
            secciones[-1][1].append(linea)
        else:
            prefacio.append(linea)
    if not secciones:
        return texto
    partes = ["\n".join(prefacio).strip()] if any(l.strip() for l in prefacio) else []
    for k, (titulo, cuerpo) in enumerate(secciones, start=1):
        contenido = "\n".join(cuerpo).strip()
        partes.append(f"## {k}. {titulo}" + (f"\n\n{contenido}" if contenido else ""))
    return "\n\n".join(partes)


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
            result = invocar_estructurado(
                chat_model,
                CircuitDocumentation,
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
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
                "design_walkthrough": estructurar_paso_a_paso(result.design_walkthrough),
            }
        except Exception:  # noqa: BLE001 - la documentación nunca invalida el circuito
            documentation[block_id] = None

    return {"documentation": documentation}
