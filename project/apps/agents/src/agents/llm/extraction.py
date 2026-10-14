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
Úsalo cuando el circuito YA ESTÁ DADO (en el texto o en una figura adjunta) y se pide
resolverlo: tensiones, corrientes, resistencia/impedancia equivalente, Thévenin/Norton,
la función de transferencia, o los valores de componentes que cumplen ciertas
mediciones o requisitos sobre ESA topología ("find Ri, Aoc and Ro", "¿qué R2 hace
falta para una ganancia de 5?", "specify component values for f0 = 1 kHz"). NO es un
diseño (mode='design' es para cuando hay que proponer el circuito desde una aplicación).
Un ejercicio de libro del tipo "Design a <configuración estándar> whose <magnitud> …"
con piezas dadas (un pot de 100 kΩ, C = 10 nF, un rango de ganancia) TAMBIÉN es este
modo: la topología es la del enunciado y lo que se busca son sus valores. Ejemplo:
"Design a noninverting amplifier whose gain is variable over 1 V/V ≤ A ≤ 5 V/V by means
of a 100-k pot" → netlist `VI i 0 1`, `X1 i n o OPAMP`, `RA o n {k*100k}`,
`RB n m {(1-k)*100k}`, `R1 m 0 {R1}`; incognitas ['R1']; un escenario con k = 1 y
'V(o)/V(i)' = 5; una pregunta 'V(o)/V(i)' con k = 0 (debe dar 1).
Si el enunciado tiene incisos —(a), (b)…— resuelve en este turno el que pidió el
usuario (o el (a) si no dijo cuál) y menciona en el nombre del escenario cuál es.
- `netlist`: transcribe la red a SPICE, un elemento por línea, nodo de referencia 0,
  sufijos SPICE (1k, 4.7u, 1meg). No agregues .control ni análisis. Usa los nombres de
  nodo que dio el usuario. Además de R, L, C, V e I acepta fuentes controladas
  (E/G/F/H, ver el schema) y op-amps `X1 in+ in- out OPAMP` (ideal) o
  `X1 in+ in- out OPAMP a=1e4 rd=1meg ro=75` (ganancia finita). Un op-amp con
  "rd = ∞, ro = 0" solo lleva `a=`. NUNCA escribas `.subckt` ni modelos: el sistema ya
  sabe qué es OPAMP.
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
  incógnita). Escríbelo como símbolo entre llaves en el netlist y declara:
  · `incognitas`: los símbolos a encontrar (['Ri', 'Ag', 'Ro']);
  · `escenarios`: cada situación del enunciado con los valores de los demás símbolos
    y lo medido o exigido en ella (`mediciones`: 'V(i)' = '125m', 'I(RL)' = '230m',
    'V(o)/V(i)' = '5', 'f0(V(o)/V(i))' = '1k');
  · `preguntas`: lo que se pide calcular con lo encontrado, con sus valores
    ('I(RL)' con RL = '0' es la corriente de cortocircuito; RL = 'inf' es un abierto).
  Ejemplo (amplificador de transconductancia): netlist `VS s 0 {vS}`, `RS s i 100k`,
  `RI i 0 {Ri}`, `GM 0 o i 0 {Ag}`, `RO o 0 {Ro}`, `RL o 0 {RL}`; un escenario por
  cada carga medida. Un potenciómetro de 100k con cursor k es `{k*100k}` y
  `{(1-k)*100k}`, con un escenario por extremo (k = 0 y k = 1). Un barrido ("para
  a = 10², 10⁴ y 10⁶") es una pregunta por valor.
- Función de transferencia, Bode, polos, f0 o Q: una pregunta con `tipo`
  'transferencia' y `calcular` = 'V(salida)/V(entrada)'; la fuente de entrada va con
  `AC 1`. Si los componentes no tienen valor, déjalos como símbolos: se deriva en letras.
- Si se elige libremente un valor ("usa C = 10 nF", "R1 = R2"), ponlo en los valores
  del escenario o repite el mismo símbolo; si el enunciado no lo fija y hace falta para
  que el sistema tenga solución, elige un valor estándar y dilo en el nombre del escenario.
- Transcribe cada componente tal como lo describe el usuario, uno por línea. NO
  combines tú resistencias en serie o en paralelo (50 Ω ∥ 200 Ω son dos líneas, no
  una de 40 Ω): la reducción paso a paso la hace el sistema.
- `frecuencia_hz`: solo si es un problema de AC con fasores a una sola frecuencia.
No resuelvas tú las ecuaciones: el sistema las arma, las resuelve y las verifica con ngspice."""


TEXTO_CORRECCION = (
    "El sistema intentó resolver tu planteamiento anterior y encontró este problema:\n"
    "{error}\n\n"
    "Revisa la transcripción del circuito contra el enunciado (y la figura, si la hay): "
    "qué nodos conecta cada componente, si van en serie o en paralelo, el sentido de las "
    "fuentes y que los escenarios y mediciones correspondan a lo que dice el problema. "
    "Devuelve el planteamiento corregido completo. No cambies el problema ni inventes "
    "datos: corrige solo lo que esté mal transcrito."
)


class ExtractionError(Exception):
    """El LLM no produjo un resultado de orquestación válido."""


class ImageInputError(ExtractionError):
    """La llamada con imágenes adjuntas falló.

    No hay forma portable de saber si fue porque el modelo no acepta imágenes
    (cada provider lo dice distinto), así que el mensaje lo plantea como la
    causa probable y conserva el detalle original.
    """


# Va junto al mensaje del usuario, no en el prompt de sistema: solo aplica
# cuando de verdad hay imágenes, y así el turno sin ellas queda idéntico.
NOTA_IMAGENES = (
    "El usuario adjuntó imágenes. Pueden contener la figura del circuito a la que se "
    "refiere el texto (p. ej. «Fig. P2.7»). Transcribe de la figura los componentes, "
    "sus valores y cómo se conectan (los nodos). NUNCA inventes un valor que no puedas "
    "leer en la figura ni en el texto: si un valor es ilegible o falta, trátalo como "
    "dato faltante en lugar de suponerlo."
)


def _user_content(request_text: str, images: list[dict] | None):
    """El contenido del mensaje del usuario: texto plano sin imágenes, o el
    formato multimodal de LangChain (que entienden langchain-openai,
    langchain-google-genai y langchain-anthropic) con ellas."""
    if not images:
        return request_text
    return [
        {"type": "text", "text": request_text},
        {"type": "text", "text": NOTA_IMAGENES},
        *(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{image['media_type']};base64,{image['data']}"},
            }
            for image in images
        ),
    ]


def _image_error(exc: Exception) -> ImageInputError:
    return ImageInputError(
        "no se pudieron procesar las imágenes adjuntas; es probable que el modelo "
        f"asignado al Orquestador no acepte imágenes (visión). Detalle: {exc}"
    )


def extract_orchestrator_outcome(
    chat_model,
    request_text: str,
    circuit_context: str | None = None,
    images: list[dict] | None = None,
    correccion: dict | None = None,
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
        {"role": "user", "content": _user_content(request_text, images)},
    ]
    if correccion:
        # Autocorrección: la respuesta anterior y lo que el sistema encontró
        # al resolverla, para que corrija la transcripción y no el problema.
        messages += [
            {"role": "assistant", "content": correccion["anterior"]},
            {"role": "user", "content": TEXTO_CORRECCION.format(error=correccion["error"])},
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
                if images:
                    raise _image_error(fallback_exc) from fallback_exc
                raise ExtractionError(f"LLM extraction failed: {fallback_exc}") from fallback_exc
        elif images:
            raise _image_error(exc) from exc
        else:
            raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
