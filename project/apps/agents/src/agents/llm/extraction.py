from agents.analisis.biblioteca import como_ejemplo, recuperar
from agents.llm.prompts import fetch_prompt
from agents.llm.structured import invocar_estructurado
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
Úsalo cuando la topología está dada o es una configuración estándar de op-amps y se pide
resolverla o encontrar sus valores:
- el circuito YA ESTÁ DADO (texto o figura): tensiones, corrientes, resistencia de entrada o
  de salida, Thévenin/Norton, función de transferencia, corrientes de alimentación y
  potencia, o deducir parámetros a partir de mediciones;
- un ejercicio de libro de diseño sobre una configuración estándar (inversor, no inversor,
  seguidor, sumador, diferencia, con potenciómetro, offset o red T): "Design a <configuración>
  whose …", "design a circuit such that vO = …". La topología es la estándar y lo que se
  busca son sus valores.
mode='design' es para proponer un circuito desde una aplicación (fuentes, filtros por
especificación, etapas con transistores), no para estos ejercicios.

PRINCIPIOS (los ejemplos resueltos de más abajo muestran la forma; adapta, no copies sus
valores):
1. `netlist`: un elemento por línea, nodo de referencia 0, sufijos SPICE (1k, 4.7u, 1meg),
   los nombres de nodo del usuario, sin .control ni análisis, y NUNCA `.subckt` ni
   modelos. Acepta R, L, C, V, I, fuentes controladas (E/G/F/H, ver el schema) y op-amps
   `X1 in+ in- out OPAMP`: ideal sin parámetros; `a= rd= ro=` para el modelo de ganancia
   finita (rd = ∞, ro = 0 → solo `a=`); `iq= vcc= vee=` cuando se pregunta por corrientes
   de alimentación, potencia o saturación.
2. NUNCA inventes el valor de un componente que el problema pide encontrar o deja libre: es
   una incógnita, va como símbolo entre llaves (`{R1}`) y en `incognitas`. Declara TODAS las
   resistencias a diseñar, también las que se pueden elegir libremente: el sistema elige de
   la serie comercial (`serie_resistencias`, E24 si no se dice) la que deja todo en la serie.
3. Un COMPORTAMIENTO pedido o medido (ganancia, peso de una entrada, resistencia de entrada o
   de salida, una corriente, la potencia, f0, Q) NUNCA es el valor de un componente: va como
   medición de un escenario (si es un requisito o un dato medido) o como pregunta (si se pide
   calcularlo). Expresiones: 'V(o)', 'V(a,b)', 'I(R1)', cocientes 'V(o)/V(i)', 'Rin(V2)'
   (resistencia que ve la fuente V2), 'Rout(o)' (resistencia de salida en el nodo o),
   'IO(X1)', 'ICC(X1)', 'IEE(X1)', 'POA(X1)', 'f0(V(o)/V(i))', 'Q(…)', 'db(…, 1k)'.
4. Una salida que combina varias entradas: un escenario POR ENTRADA, con esa en 1 y las
   demás en 0. Así ngspice verifica cada peso por separado.
5. Las fuentes del problema (incluidas las alimentaciones usadas como entrada) van con su
   valor. NUNCA inventes una fuente que el problema no da.
6. Un potenciómetro de valor R con cursor k es `{k*R}` y `{(1-k)*R}`, con un caso por extremo
   (k = 0 y k = 1). Un barrido ("para a = 10², 10⁴ y 10⁶") es una pregunta por valor.
7. Función de transferencia, Bode, polos, f0 o Q: una pregunta con `tipo` 'transferencia' y
   `calcular` = 'V(salida)/V(entrada)'; la fuente de entrada va con `AC 1`. Sin valores, los
   componentes quedan como símbolos y se deriva en letras.
8. Si el enunciado tiene incisos (a), (b)…, plantea TODOS: cada uno con sus escenarios o
   preguntas, y su letra en el nombre.
9. `requisitos`: TODO lo que el enunciado da o pide, uno por renglón, con dónde quedó. El
   sistema comprueba que cada uno esté donde dices; si falta, te lo devuelve.
10. Resistencia/impedancia equivalente entre dos terminales de una red pasiva: transcribe SOLO
   los elementos de la red y pon los dos nodos en `terminales`.
   NO agregues una fuente de prueba aunque el usuario la pida: el sistema conecta su propia
   fuente de 1 V entre los `terminales`. Si la red no tiene tierra, NO inventes una conexión a 0 ni un elemento
   extra: el sistema toma el segundo terminal como referencia.
11. Transcribe cada componente tal como lo describe el usuario, uno por línea. NO
  combines tú resistencias en serie o en paralelo: la reducción la hace el sistema.
12. `metodo`: el que pidió ('nodos', 'mallas', 'reduccion', 'thevenin') o 'completo';
   `frecuencia_hz` solo para fasores a una sola frecuencia.
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


def ejemplos_parecidos(request_text: str) -> str:
    """Los planteamientos de la biblioteca más parecidos al pedido, como
    ejemplos. Viven como datos probados contra el libro, no como párrafos en
    la guía: agregar un problema resuelto no toca el prompt de los demás."""
    ejemplos = recuperar(request_text)
    if not ejemplos:
        return ""
    return (
        "\n\n## EJEMPLOS RESUELTOS PARECIDOS (la forma de un buen planteamiento; los "
        "valores son de otro problema)\n\n" + "\n\n".join(como_ejemplo(e) for e in ejemplos)
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
        + GUIA_MODO_ANALISIS
        + ejemplos_parecidos(request_text),
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
        result = invocar_estructurado(chat_model, OrchestratorResult, messages)
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        if images:
            raise _image_error(exc) from exc
        raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
