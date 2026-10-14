from agents.llm.prompts import fetch_prompt
from agents.orquestador.schema import (
    AnalysisOutcome,
    ChatOutcome,
    ClarifyOutcome,
    DesignOutcome,
    OrchestratorResult,
)


# Va junto al catálogo y no en el prompt de Langfuse: el modo existe por
# este código, y su instrucción tiene que viajar con él aunque el prompt
# publicado sea anterior.
GUIA_MODO_ANALISIS = """## MODO ANÁLISIS (mode='analysis')
Si el usuario da un circuito YA ARMADO (con sus valores) y pregunta por tensiones,
corrientes, la resistencia o impedancia equivalente, o el equivalente de Thévenin/Norton
—"resuelve por mallas", "por nodos", "reduce la red", "encuentra la corriente en R3"—,
NO es un diseño: responde con mode='analysis'.
- `netlist`: transcribe la red a SPICE, un elemento por línea (R, L, C, V, I), nodo de
  referencia 0, sufijos SPICE (1k, 4.7u). No agregues .control ni análisis. Usa los
  nombres de nodo que dio el usuario.
- `metodo`: el que pidió ('nodos', 'mallas', 'reduccion', 'thevenin') o 'completo'.
- `terminales`: los dos nodos para reducción o Thévenin (ej. ['a','0']); deben ser
  nodos que aparezcan en `netlist`.
- Resistencia/impedancia equivalente entre dos terminales: transcribe SOLO los
  elementos de la red. NO agregues una fuente de prueba aunque el usuario la pida
  ("aplica 1 V para validar"): el sistema conecta su propia fuente de prueba de 1 V
  entre los `terminales` y mide Req = 1 V / I. Una fuente tuya —p. ej. de un terminal
  a 0 con el otro al aire— deja la red sin corriente y no valida nada. Incluye una
  fuente solo si forma parte del circuito que el usuario describe.
- Si la red no tiene tierra (una red pasiva entre dos terminales), NO inventes una
  conexión a 0 ni un elemento extra: el sistema toma el segundo terminal como
  referencia.
- NUNCA inventes el valor de un componente que el problema pide encontrar (una
  incógnita: "find Ri, Aoc and Ro", "¿qué R2 hace falta?", parámetros que se deducen
  de mediciones). Si la red no se puede escribir sin inventar valores, NO uses
  mode='analysis': responde con mode='chat', plantea las ecuaciones del problema y
  resuélvelo paso a paso, diciendo que es una resolución sin verificación de ngspice.
- Transcribe cada componente tal como lo describe el usuario, uno por línea. NO
  combines tú resistencias en serie o en paralelo (50 Ω ∥ 200 Ω son dos líneas, no
  una de 40 Ω): la reducción paso a paso la hace el sistema.
- `frecuencia_hz`: solo si es un problema de AC con fasores.
No resuelvas tú las ecuaciones: el sistema las arma, las resuelve y las verifica con ngspice."""


class ExtractionError(Exception):
    """El LLM no produjo un resultado de orquestación válido."""


def extract_orchestrator_outcome(
    chat_model, request_text: str, circuit_context: str | None = None
) -> ChatOutcome | ClarifyOutcome | DesignOutcome | AnalysisOutcome:
    structured_model = chat_model.with_structured_output(OrchestratorResult)

    if circuit_context is None:
        try:
            from agents.knowledge.circuit_client import (
                build_circuits_knowledge_context,
                fetch_circuit_catalog,
            )

            circuit_context = build_circuits_knowledge_context(fetch_circuit_catalog())
        except Exception:
            circuit_context = None

    system_prompt = fetch_prompt(
        "orquestador-system",
        retrieved_circuits_catalog=(circuit_context or "(catálogo no disponible)")
        + "\n\n"
        + GUIA_MODO_ANALISIS,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request_text},
    ]
    try:
        result = structured_model.invoke(messages)
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        if "structured outputs not support" in str(exc).lower() or "json_schema" in str(exc).lower():
            try:
                fallback_model = chat_model.with_structured_output(
                    OrchestratorResult, method="function_calling"
                )
                result = fallback_model.invoke(messages)
            except Exception as fallback_exc:
                raise ExtractionError(f"LLM extraction failed: {fallback_exc}") from fallback_exc
        else:
            raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
