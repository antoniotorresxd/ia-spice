# Gate Conversacional del Orquestador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El orquestador deja de forzar cualquier mensaje a producir un circuito: distingue charla ("hola") de pedidos de diseño, y cuando falta información pregunta en vez de inventar valores.

**Architecture:** El LLM del orquestador resuelve, en una sola llamada, un resultado discriminado (`chat` / `clarify` / `design`) en vez de un `CircuitSpec` forzado. El grafo corta a `END` para `chat`/`clarify` sin tocar `calculo`/`sintesis`/`curador`. El server mapea esos dos modos a `execution.status = "completed"` con el mensaje del assistant correspondiente, sin tocar la tabla de artefactos.

**Tech Stack:** Python 3.12 / Pydantic v2 / LangChain (`with_structured_output`) / LangGraph en `apps/agents`; TypeScript / Bun / Drizzle en `apps/server`.

**Spec:** `docs/superpowers/specs/2026-09-13-orquestador-gate-conversacional-design.md`

## Global Constraints

- No se agrega ningún valor a `EXECUTION_STATUSES` ni se toca `workspace.model.ts` / migraciones de Drizzle: `chat`/`clarify` reutilizan `"completed"`.
- Un turno `chat`/`clarify` **nunca** borra ni reemplaza los artefactos existentes de la conversación (la tabla `artifact` no se toca en esos dos modos).
- El camino `circuit_spec` estructurado (sin `request_text`) sigue sin pasar por el LLM de triage — va directo a `design`.
- Una sola llamada LLM resuelve el modo; no se agrega un paso de clasificación previo por separado.
- `verdict` sigue siendo exclusivamente el resultado `accepted`/`rejected` del `curador`; los modos `chat`/`clarify` viven en un campo nuevo, `outcome`, separado.

---

## Contexto de archivos existentes que este plan modifica

- `apps/agents/src/agents/orquestador/schema.py` — `CircuitSpec` y los `Block` curados. Se le agregan los modelos de salida discriminada.
- `apps/agents/src/agents/llm/extraction.py` — `extract_circuit_spec` + `_SYSTEM_PROMPT`. Se reescribe para resolver el discriminador.
- `apps/agents/src/agents/orquestador/node.py` — `orquestador_node` / `route_after_orquestador`.
- `apps/agents/src/agents/state.py` — `CircuitState` (TypedDict).
- `apps/agents/src/agents/graph.py` — `build_graph`, ruteo condicional tras `orquestador`.
- `apps/agents/src/agents/api.py` — `create_run`, construye `initial_state` y arma la respuesta HTTP.
- `apps/server/src/modules/workspace/workspace.runner.ts` — `AgentsRunResult`, `mapVerdictToStatus`, `toArtifactDrafts`, `toAssistantMessage`.
- `apps/server/src/modules/workspace/workspace.services.ts` — `makeDbSink`.

---

### Task 1: Modelos de salida discriminada del orquestador

**Files:**
- Modify: `apps/agents/src/agents/orquestador/schema.py`
- Test: `apps/agents/tests/test_orquestador.py`

**Interfaces:**
- Produces: `ChatOutcome(mode: Literal["chat"], reply: str)`, `ClarifyOutcome(mode: Literal["clarify"], question: str, partial_spec: dict)`, `DesignOutcome(mode: Literal["design"], spec: CircuitSpec)`, `OrchestratorResult(outcome: ChatOutcome | ClarifyOutcome | DesignOutcome)` — todos en `agents.orquestador.schema`, todos `pydantic.BaseModel`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `apps/agents/tests/test_orquestador.py`:

```python
def test_orchestrator_result_parses_chat_outcome():
    from agents.orquestador.schema import OrchestratorResult

    result = OrchestratorResult.model_validate(
        {"outcome": {"mode": "chat", "reply": "¡Hola! ¿Qué circuito querés diseñar?"}}
    )
    assert result.outcome.mode == "chat"
    assert result.outcome.reply == "¡Hola! ¿Qué circuito querés diseñar?"


def test_orchestrator_result_parses_clarify_outcome_with_empty_partial_spec():
    from agents.orquestador.schema import OrchestratorResult

    result = OrchestratorResult.model_validate(
        {"outcome": {"mode": "clarify", "question": "¿Qué voltaje de entrada y salida necesitás?"}}
    )
    assert result.outcome.mode == "clarify"
    assert result.outcome.partial_spec == {}


def test_orchestrator_result_parses_design_outcome_with_a_full_spec():
    from agents.orquestador.schema import OrchestratorResult

    result = OrchestratorResult.model_validate(
        {
            "outcome": {
                "mode": "design",
                "spec": {
                    "blocks": [
                        {
                            "id": "div1",
                            "type": "voltage_divider",
                            "params": {"v_in": 5.0, "v_out": 3.3},
                        }
                    ]
                },
            }
        }
    )
    assert result.outcome.mode == "design"
    assert result.outcome.spec.blocks[0].id == "div1"


def test_orchestrator_result_rejects_an_unknown_mode():
    from pydantic import ValidationError

    from agents.orquestador.schema import OrchestratorResult

    with pytest.raises(ValidationError):
        OrchestratorResult.model_validate({"outcome": {"mode": "smalltalk", "reply": "hola"}})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/agents && uv run pytest tests/test_orquestador.py -k orchestrator_result -v`
Expected: FAIL con `ImportError: cannot import name 'OrchestratorResult'`

- [ ] **Step 3: Agregar los modelos a `schema.py`**

Al final de `apps/agents/src/agents/orquestador/schema.py`, después de la clase `CircuitSpec`:

```python
class ChatOutcome(BaseModel):
    """El mensaje no era un pedido de diseño."""

    mode: Literal["chat"]
    reply: str = Field(min_length=1)


class ClarifyOutcome(BaseModel):
    """Hay intención de diseño pero falta información para completar un bloque."""

    mode: Literal["clarify"]
    question: str = Field(min_length=1)
    partial_spec: dict = Field(default_factory=dict)


class DesignOutcome(BaseModel):
    """Hay suficiente información: la especificación completa de siempre."""

    mode: Literal["design"]
    spec: CircuitSpec


class OrchestratorResult(BaseModel):
    """Envoltorio de nivel superior para el structured output del LLM.

    El discriminador vive en un campo (outcome.mode), no en la raíz: varios
    proveedores no aceptan una unión suelta como schema de nivel superior
    para tool calling, pero sí un objeto con un campo discriminado adentro.
    """

    outcome: Annotated[
        ChatOutcome | ClarifyOutcome | DesignOutcome,
        Field(discriminator="mode"),
    ]
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd apps/agents && uv run pytest tests/test_orquestador.py -k orchestrator_result -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/agents/orquestador/schema.py apps/agents/tests/test_orquestador.py
git commit -m "feat(agents): modelos de salida discriminada chat/clarify/design del orquestador"
```

---

### Task 2: Reescribir la extracción para resolver el discriminador

**Files:**
- Modify: `apps/agents/src/agents/llm/extraction.py`
- Test: `apps/agents/tests/test_extraction.py`

**Interfaces:**
- Consumes: `ChatOutcome`, `ClarifyOutcome`, `DesignOutcome`, `OrchestratorResult` de `agents.orquestador.schema` (Task 1).
- Produces: `extract_orchestrator_outcome(chat_model, request_text: str) -> ChatOutcome | ClarifyOutcome | DesignOutcome` en `agents.llm.extraction`. `ExtractionError` se mantiene (mismo nombre, misma semántica: cualquier fallo del LLM o de tipo inesperado).

- [ ] **Step 1: Reescribir el test (reemplaza el archivo completo)**

`apps/agents/tests/test_extraction.py`:

```python
import pytest

from agents.llm.extraction import ExtractionError, extract_orchestrator_outcome
from agents.orquestador.schema import ChatOutcome, ClarifyOutcome, DesignOutcome, CircuitSpec, OrchestratorResult


class _FakeStructuredModel:
    def __init__(self, result):
        self._result = result

    def invoke(self, messages):
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class _FakeChatModel:
    def __init__(self, result):
        self._result = result

    def with_structured_output(self, schema):
        assert schema is OrchestratorResult
        return _FakeStructuredModel(self._result)


FIXED_SPEC = CircuitSpec(
    blocks=[
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
    ]
)


def test_extract_orchestrator_outcome_unwraps_a_chat_reply():
    fixed = OrchestratorResult(outcome=ChatOutcome(mode="chat", reply="¡Hola!"))
    chat_model = _FakeChatModel(fixed)

    outcome = extract_orchestrator_outcome(chat_model, "hola")

    assert isinstance(outcome, ChatOutcome)
    assert outcome.reply == "¡Hola!"


def test_extract_orchestrator_outcome_unwraps_a_clarify_question():
    fixed = OrchestratorResult(
        outcome=ClarifyOutcome(mode="clarify", question="¿Qué voltaje necesitás?", partial_spec={})
    )
    chat_model = _FakeChatModel(fixed)

    outcome = extract_orchestrator_outcome(chat_model, "diseña una fuente")

    assert isinstance(outcome, ClarifyOutcome)
    assert outcome.question == "¿Qué voltaje necesitás?"


def test_extract_orchestrator_outcome_unwraps_a_design_spec():
    fixed = OrchestratorResult(outcome=DesignOutcome(mode="design", spec=FIXED_SPEC))
    chat_model = _FakeChatModel(fixed)

    outcome = extract_orchestrator_outcome(chat_model, "dame un divisor de 5V a 3.3V")

    assert isinstance(outcome, DesignOutcome)
    assert outcome.spec == FIXED_SPEC


def test_extract_orchestrator_outcome_wraps_failures():
    chat_model = _FakeChatModel(RuntimeError("boom"))
    with pytest.raises(ExtractionError, match="boom"):
        extract_orchestrator_outcome(chat_model, "algo")
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/agents && uv run pytest tests/test_extraction.py -v`
Expected: FAIL con `ImportError: cannot import name 'extract_orchestrator_outcome'`

- [ ] **Step 3: Reescribir `extraction.py` (reemplaza el archivo completo)**

`apps/agents/src/agents/llm/extraction.py`:

```python
from agents.orquestador.schema import ChatOutcome, ClarifyOutcome, DesignOutcome, OrchestratorResult

_SYSTEM_PROMPT = """\
Eres el orquestador de un sistema que diseña circuitos electrónicos \
analógicos. Cada mensaje del usuario puede ser una de tres cosas — decidí \
cuál con el campo "outcome.mode":

1. "chat": el mensaje NO es un pedido de diseño de circuito (saludos, \
   preguntas sobre qué podés hacer, charla en general). Devolvé \
   outcome.reply con una respuesta breve y directa en español. No inventes \
   un circuito para un saludo.

2. "clarify": el mensaje sí pide un circuito, pero falta información \
   necesaria para completar al menos un bloque (no se identificó el tipo, \
   o falta un parámetro numérico requerido por el tipo identificado). \
   Devolvé outcome.question con UNA pregunta concreta pidiendo lo que \
   falta (ej. "¿Qué voltaje de entrada y de salida necesitás?"), y \
   outcome.partial_spec con lo que ya se pudo inferir (puede ser {} si no \
   se identificó nada todavía; si se identificó el tipo, incluilo junto \
   con los parámetros que sí se dieron). Nunca inventes valores para \
   completar lo que falta.

3. "design": hay suficiente información para intentar el diseño. Devolvé \
   outcome.spec con la especificación estructurada completa, usando las \
   mismas reglas de tipos y parámetros que siguen abajo.

Tipos de circuito soportados para outcome.spec, con sus parámetros (todos \
en unidades SI salvo que se indique):
- voltage_divider: divisor de voltaje resistivo. params: v_in (V), \
  v_out objetivo (V).
- rc_lowpass: filtro RC pasa-bajas. params: f_c objetivo, frecuencia de \
  corte (Hz).
- led_resistor: LED con resistencia limitadora. params: v_in (V), v_f, \
  voltage forward del LED (V), i_led objetivo, corriente (A).
- noninverting_amp: amplificador no inversor con amplificador operacional \
  (macromodelo). params: v_in (V), v_out objetivo (V). La ganancia es \
  v_out/v_in y tiene que ser mayor que 1: un no inversor no atenúa.

Si la solicitud NO encaja en ninguno de los tipos anteriores PERO ya hay \
suficiente información para escribir el netlist completo, usa el tipo \
"generic" dentro de outcome.spec y entrega tú el netlist. params:
- description: qué circuito es, en una frase.
- metric: nombre de la magnitud que se mide (ej. "v_out", "f_c", "i_out").
- target: valor objetivo de esa magnitud, en unidades SI.
- netlist: el netlist SPICE completo, listo para `ngspice -b`.

El netlist de un bloque generic TIENE que incluir un bloque .control que \
ejecute el análisis y escriba la magnitud medida en output.txt, y cerrar \
con .endc y .end. Dos patrones válidos:

  .control
  op
  wrdata output.txt v(vout)
  .endc
  .end

  .control
  ac dec 100 1 1e9
  meas ac fc WHEN vdb(vout)=-3.0103
  echo $&fc > output.txt
  .endc
  .end

"generic" es para cuando el circuito no encaja en el catálogo curado, NO \
para cuando falta información: si falta información, usa "clarify" sin \
importar el tipo. Preferí siempre un tipo curado cuando la solicitud \
encaje en él: sus valores salen de ecuaciones exactas y son repetibles.

Cada bloque de outcome.spec necesita un "id" único de tu elección (string \
corto, ej. "div1"). Si el usuario no especifica tolerancia ni número \
máximo de iteraciones, omite esos campos (tienen defaults). Devolvé \
únicamente el resultado estructurado, sin explicación adicional fuera de \
él.
"""


class ExtractionError(Exception):
    """El LLM no produjo un resultado de orquestación válido."""


def extract_orchestrator_outcome(
    chat_model, request_text: str
) -> ChatOutcome | ClarifyOutcome | DesignOutcome:
    structured_model = chat_model.with_structured_output(OrchestratorResult)
    try:
        result = structured_model.invoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": request_text},
            ]
        )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd apps/agents && uv run pytest tests/test_extraction.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/agents/llm/extraction.py apps/agents/tests/test_extraction.py
git commit -m "feat(agents): el orquestador resuelve chat/clarify/design en una sola llamada LLM"
```

---

### Task 3: `orquestador_node` usa el nuevo discriminador

**Files:**
- Modify: `apps/agents/src/agents/orquestador/node.py`
- Test: `apps/agents/tests/test_orquestador.py`

**Interfaces:**
- Consumes: `extract_orchestrator_outcome`, `ExtractionError` de `agents.llm.extraction` (Task 2).
- Produces: `orquestador_node` devuelve, además de lo existente, la clave `"outcome"` (`{"mode": "chat", "reply": str}` o `{"mode": "clarify", "question": str, "partial_spec": dict}`) cuando corresponde. `route_after_orquestador(state) -> "continue" | "stop" | "reject"`.

- [ ] **Step 1: Actualizar los tests existentes que monkeypatchean la extracción**

En `apps/agents/tests/test_orquestador.py`, estos tres tests quedan rotos porque monkeypatchean `extract_circuit_spec` devolviendo un `CircuitSpec` pelado; hay que envolverlo en `DesignOutcome` y apuntar al nuevo nombre. Reemplazar:

```python
def test_request_text_uses_llm_to_produce_normalized_spec(monkeypatch):
    fake_spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ],
        "max_iterations": 5,
        "tolerance": 0.05,
    }
    from agents.orquestador.schema import CircuitSpec, DesignOutcome

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_orchestrator_outcome",
        lambda chat_model, text: DesignOutcome(
            mode="design", spec=CircuitSpec.model_validate(fake_spec)
        ),
    )

    result = orquestador_node(
        _state(request_text="dame un divisor de 5V a 3.3V"),
        {"configurable": {"user_id": "user-1"}},
    )

    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
    assert result["circuit_spec"] == fake_spec
    assert result["pending_blocks"] == ["div1"]
```

y

```python
def test_request_text_extraction_failure_is_rejected(monkeypatch):
    from agents.llm.extraction import ExtractionError

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())

    def _raise(chat_model, text):
        raise ExtractionError("LLM returned garbage")

    monkeypatch.setattr(orquestador_module, "extract_orchestrator_outcome", _raise)

    result = orquestador_node(
        _state(request_text="algo"), {"configurable": {"user_id": "user-1"}}
    )

    assert result["verdict"]["status"] == "rejected"
    assert "llm_extraction_failed" in result["verdict"]["reason"]
```

y en `test_el_camino_generico_tambien_llega_desde_lenguaje_natural` (que en realidad está en `test_graph.py`, ver Task 4). En `test_orquestador.py` no hay más monkeypatches de `extract_circuit_spec`; confirmar con:

```bash
grep -n "extract_circuit_spec" apps/agents/tests/test_orquestador.py
```

no debe quedar ninguna coincidencia después de este paso.

Agregar además, al final del archivo, los tests nuevos para `chat` y `clarify`:

```python
def test_request_text_chat_outcome_returns_a_reply_without_touching_the_pipeline(monkeypatch):
    from agents.orquestador.schema import ChatOutcome

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_orchestrator_outcome",
        lambda chat_model, text: ChatOutcome(mode="chat", reply="¡Hola! ¿Qué circuito querés diseñar?"),
    )

    result = orquestador_node(_state(request_text="hola"), {"configurable": {"user_id": "user-1"}})

    assert result["outcome"] == {"mode": "chat", "reply": "¡Hola! ¿Qué circuito querés diseñar?"}
    assert "normalized_spec" not in result
    assert result.get("verdict") is None


def test_request_text_clarify_outcome_carries_the_question_and_partial_spec(monkeypatch):
    from agents.orquestador.schema import ClarifyOutcome

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_orchestrator_outcome",
        lambda chat_model, text: ClarifyOutcome(
            mode="clarify",
            question="¿Qué voltaje de entrada y de salida necesitás?",
            partial_spec={"type": "voltage_divider"},
        ),
    )

    result = orquestador_node(_state(request_text="diseña una fuente"), {"configurable": {"user_id": "user-1"}})

    assert result["outcome"] == {
        "mode": "clarify",
        "question": "¿Qué voltaje de entrada y de salida necesitás?",
        "partial_spec": {"type": "voltage_divider"},
    }
    assert result.get("verdict") is None


def test_route_after_orquestador_stops_on_chat_and_clarify():
    assert route_after_orquestador({"verdict": None, "outcome": {"mode": "chat", "reply": "hola"}}) == "stop"
    assert (
        route_after_orquestador(
            {"verdict": None, "outcome": {"mode": "clarify", "question": "x", "partial_spec": {}}}
        )
        == "stop"
    )
    assert route_after_orquestador({"verdict": None, "outcome": None}) == "continue"
    assert route_after_orquestador({"verdict": None}) == "continue"
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/agents && uv run pytest tests/test_orquestador.py -v`
Expected: FAIL — `AttributeError`/`ImportError` en los tests que referencian `extract_orchestrator_outcome`, `ChatOutcome`, `ClarifyOutcome` (todavía no están cableados en `node.py`), y `test_route_after_orquestador_stops_on_chat_and_clarify` falla porque la función vieja no conoce `"stop"`.

- [ ] **Step 3: Reescribir `node.py`**

Reemplazar el import y el cuerpo de `orquestador_node`/`route_after_orquestador` en
`apps/agents/src/agents/orquestador/node.py`:

```python
from agents.llm.extraction import ExtractionError, extract_orchestrator_outcome
```

(reemplaza la línea `from agents.llm.extraction import ExtractionError, extract_circuit_spec`)

```python
def orquestador_node(state: CircuitState, config: RunnableConfig | None = None) -> dict:
    request_text = state.get("request_text")
    circuit_spec = state.get("circuit_spec")

    if request_text:
        user_id = (config or {}).get("configurable", {}).get("user_id")
        if not user_id:
            return _rejected("missing user_id in run config")

        try:
            chat_model = get_chat_model(user_id)
        except LlmSettingsError as exc:
            return _rejected(f"llm_settings_unavailable: {exc}")

        try:
            outcome = extract_orchestrator_outcome(chat_model, request_text)
        except ExtractionError as exc:
            return _rejected(f"llm_extraction_failed: {exc}")

        if outcome.mode == "chat":
            return {"outcome": {"mode": "chat", "reply": outcome.reply}}

        if outcome.mode == "clarify":
            return {
                "outcome": {
                    "mode": "clarify",
                    "question": outcome.question,
                    "partial_spec": outcome.partial_spec,
                }
            }

        spec = outcome.spec
        result = _normalize(spec)
        # se sobreescribe circuit_spec con lo que el LLM entendió, para que
        # history/depuración muestren la especificación resuelta
        result["circuit_spec"] = spec.model_dump(mode="json")
        return result

    if circuit_spec:
        try:
            spec = CircuitSpec.model_validate(circuit_spec)
        except ValidationError as exc:
            return _rejected(f"invalid circuit_spec: {exc}")
        return _normalize(spec)

    return _rejected("no input provided: neither request_text nor circuit_spec")


def route_after_orquestador(state: CircuitState) -> str:
    if state["verdict"] is not None:
        return "reject"
    outcome = state.get("outcome")
    if outcome and outcome.get("mode") in ("chat", "clarify"):
        return "stop"
    return "continue"
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd apps/agents && uv run pytest tests/test_orquestador.py -v`
Expected: PASS (todos, incluidos los renombrados y los tres nuevos)

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/agents/orquestador/node.py apps/agents/tests/test_orquestador.py
git commit -m "feat(agents): orquestador_node corta a chat/clarify sin forzar un CircuitSpec"
```

---

### Task 4: Cablear `outcome` en el estado, el grafo y la API HTTP

**Files:**
- Modify: `apps/agents/src/agents/state.py`
- Modify: `apps/agents/src/agents/graph.py`
- Modify: `apps/agents/src/agents/api.py`
- Test: `apps/agents/tests/test_graph.py`

**Interfaces:**
- Consumes: `route_after_orquestador` devolviendo `"continue" | "stop" | "reject"` (Task 3).
- Produces: `CircuitState.outcome: dict | None`. `build_graph()` rutea `"stop"` a `END`. `POST /runs` devuelve también la clave `"outcome"`.

- [ ] **Step 1: Actualizar los tests que fallan primero**

En `apps/agents/tests/test_graph.py`, agregar `"outcome": None,` a los dos helpers que construyen el estado inicial (`_initial_state` y el `initial_state` inline de `test_request_text_end_to_end_with_fake_llm` y `test_request_text_end_to_end_with_live_llm`):

```python
def _initial_state(circuit_spec):
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
        "documentation": {},
        "outcome": None,
    }
```

(mismo agregado — `"outcome": None,` antes del cierre de diccionario — en los dos `initial_state = {...}` inline más abajo en el archivo).

Agregar al final del archivo:

```python
def test_chat_message_stops_before_calculo_and_reports_the_reply(monkeypatch):
    from agents.orquestador.schema import ChatOutcome

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_orchestrator_outcome",
        lambda chat_model, text: ChatOutcome(mode="chat", reply="¡Hola! ¿Qué circuito querés diseñar?"),
    )

    graph = build_graph()
    initial = _initial_state({"blocks": []})
    initial["request_text"] = "hola"

    final = graph.invoke(
        initial, {"configurable": {"thread_id": "e2e-chat", "user_id": "test-user"}}
    )

    assert final["outcome"] == {"mode": "chat", "reply": "¡Hola! ¿Qué circuito querés diseñar?"}
    assert final["verdict"] is None
    assert final["sim_results"] == {}
    assert final["netlists"] == {}


def test_insufficient_info_stops_with_a_clarifying_question(monkeypatch):
    from agents.orquestador.schema import ClarifyOutcome

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_orchestrator_outcome",
        lambda chat_model, text: ClarifyOutcome(
            mode="clarify",
            question="¿Qué voltaje de entrada y de salida necesitás?",
            partial_spec={},
        ),
    )

    graph = build_graph()
    initial = _initial_state({"blocks": []})
    initial["request_text"] = "diseña una fuente"

    final = graph.invoke(
        initial, {"configurable": {"thread_id": "e2e-clarify", "user_id": "test-user"}}
    )

    assert final["outcome"]["mode"] == "clarify"
    assert final["outcome"]["question"] == "¿Qué voltaje de entrada y de salida necesitás?"
    assert final["verdict"] is None
    assert final["sim_results"] == {}
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/agents && uv run pytest tests/test_graph.py -k "chat_message or insufficient_info" -v`
Expected: FAIL — `KeyError: 'outcome'` (el canal no existe todavía en `CircuitState`) o la rama `"stop"` no está mapeada en `build_graph`.

- [ ] **Step 3: Agregar el campo a `state.py`**

En `apps/agents/src/agents/state.py`, dentro de `CircuitState`, después de `pending_blocks`:

```python
    # Escrito por 'orquestador' cuando el mensaje no llega a ser un diseño:
    # charla (mode="chat") o falta información (mode="clarify", con lo que
    # ya se pudo inferir en partial_spec). None en el camino de diseño.
    outcome: dict | None
```

- [ ] **Step 4: Agregar la rama `"stop"` en `graph.py`**

En `apps/agents/src/agents/graph.py`, el `add_conditional_edges` de `orquestador` pasa de:

```python
    builder.add_conditional_edges(
        "orquestador",
        route_after_orquestador,
        {"continue": "calculo", "reject": END},
    )
```

a:

```python
    builder.add_conditional_edges(
        "orquestador",
        route_after_orquestador,
        {"continue": "calculo", "stop": END, "reject": END},
    )
```

- [ ] **Step 5: Propagar `outcome` en `api.py`**

En `apps/agents/src/agents/api.py`, dentro de `create_run`, agregar `"outcome": None,` al `initial_state` (junto a `"verdict": None,`), y agregar `"outcome": final_state["outcome"],` al diccionario de retorno (junto a `"verdict": final_state["verdict"],`).

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `cd apps/agents && uv run pytest tests/ -v`
Expected: PASS — la suite completa, no solo los nuevos (para pescar cualquier fixture de estado que haya quedado sin el campo).

- [ ] **Step 7: Commit**

```bash
git add apps/agents/src/agents/state.py apps/agents/src/agents/graph.py apps/agents/src/agents/api.py apps/agents/tests/test_graph.py
git commit -m "feat(agents): el grafo corta a END en chat/clarify sin pasar por calculo/sintesis/curador"
```

---

### Task 5: El server distingue `outcome` de `verdict` al persistir una corrida

**Files:**
- Modify: `apps/server/src/modules/workspace/workspace.runner.ts`
- Test: `apps/server/src/modules/workspace/workspace.runner.test.ts`

**Interfaces:**
- Produces: `AgentsOutcome` (union `chat`/`clarify`/`design`), `AgentsRunResult.outcome: AgentsOutcome | null`, `resolveRunOutcome(result: AgentsRunResult): RunOutcome` donde `RunOutcome = { status: "completed" | "failed"; summary: string; assistantMessage: string; normalizedSpec: unknown | null; artifacts: ArtifactDraft[] | null }` (`artifacts: null` significa "no tocar la tabla de artefactos").

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `apps/server/src/modules/workspace/workspace.runner.test.ts`, después del `describe("toAssistantMessage", ...)`:

```typescript
import { resolveRunOutcome } from "./workspace.runner";

describe("resolveRunOutcome", () => {
  test("outcome chat -> completed con la respuesta, sin tocar artefactos ni el spec", () => {
    const result = resolveRunOutcome({
      ...accepted,
      outcome: { mode: "chat", reply: "¡Hola! ¿Qué circuito querés diseñar?" },
    });

    expect(result).toEqual({
      status: "completed",
      summary: "¡Hola! ¿Qué circuito querés diseñar?",
      assistantMessage: "¡Hola! ¿Qué circuito querés diseñar?",
      normalizedSpec: null,
      artifacts: null,
    });
  });

  test("outcome clarify -> completed con la pregunta y el spec parcial reinyectable", () => {
    const result = resolveRunOutcome({
      ...accepted,
      outcome: {
        mode: "clarify",
        question: "¿Qué voltaje de entrada y de salida necesitás?",
        partial_spec: { type: "voltage_divider" },
      },
    });

    expect(result).toEqual({
      status: "completed",
      summary: "¿Qué voltaje de entrada y de salida necesitás?",
      assistantMessage: "¿Qué voltaje de entrada y de salida necesitás?",
      normalizedSpec: { type: "voltage_divider" },
      artifacts: null,
    });
  });

  test("sin outcome (o outcome design) usa el camino de veredicto existente, artefactos incluidos", () => {
    const result = resolveRunOutcome({ ...accepted, outcome: null });

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("all blocks within tolerance");
    expect(result.normalizedSpec).toEqual(accepted.normalized_spec);
    expect(result.artifacts).toEqual(toArtifactDrafts(accepted));
  });
});
```

También agregar `outcome: null` al fixture `accepted` al comienzo del archivo:

```typescript
const accepted: AgentsRunResult = {
  outcome: null,
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  ...
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/server && bun test workspace.runner.test.ts`
Expected: FAIL — `resolveRunOutcome is not a function`, y errores de tipo por el `outcome` que falta en `AgentsRunResult`.

- [ ] **Step 3: Agregar el tipo y la función a `workspace.runner.ts`**

Después de `export type AgentsVerdict = {...}` en `apps/server/src/modules/workspace/workspace.runner.ts`, agregar:

```typescript
export type AgentsOutcome =
  | { mode: "chat"; reply: string }
  | { mode: "clarify"; question: string; partial_spec: unknown }
  | { mode: "design" };
```

Modificar `AgentsRunResult` agregando el campo (primera línea del tipo):

```typescript
export type AgentsRunResult = {
  outcome: AgentsOutcome | null;
  verdict: AgentsVerdict | null;
  ...
```

Después de `toAssistantMessage`, agregar:

```typescript
export type RunOutcome = {
  status: Extract<ExecutionStatus, "completed" | "failed">;
  summary: string;
  assistantMessage: string;
  normalizedSpec: unknown | null;
  // null = no tocar la tabla de artefactos (turno de chat/clarify sobre una
  // conversación que ya tenía un diseño vigente); array = reemplazo
  // completo, igual que el camino de diseño de siempre.
  artifacts: ArtifactDraft[] | null;
};

export function resolveRunOutcome(result: AgentsRunResult): RunOutcome {
  if (result.outcome?.mode === "chat") {
    return {
      status: "completed",
      summary: result.outcome.reply,
      assistantMessage: result.outcome.reply,
      normalizedSpec: null,
      artifacts: null,
    };
  }

  if (result.outcome?.mode === "clarify") {
    return {
      status: "completed",
      summary: result.outcome.question,
      assistantMessage: result.outcome.question,
      normalizedSpec: result.outcome.partial_spec,
      artifacts: null,
    };
  }

  const { status, summary } = mapVerdictToStatus(result.verdict);
  return {
    status,
    summary,
    assistantMessage: toAssistantMessage(result),
    normalizedSpec: result.normalized_spec,
    artifacts: toArtifactDrafts(result),
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd apps/server && bun test workspace.runner.test.ts`
Expected: PASS (todos, incluidos los tres nuevos de `resolveRunOutcome`)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/workspace/workspace.runner.ts apps/server/src/modules/workspace/workspace.runner.test.ts
git commit -m "feat(server): resolveRunOutcome distingue chat/clarify del veredicto de diseño"
```

---

### Task 6: `makeDbSink` persiste `chat`/`clarify` sin tocar artefactos

**Files:**
- Modify: `apps/server/src/modules/workspace/workspace.services.ts`
- Test: `apps/server/src/modules/workspace/workspace.services.test.ts`

**Interfaces:**
- Consumes: `resolveRunOutcome` de `apps/server/src/modules/workspace/workspace.runner.ts` (Task 5).

- [ ] **Step 1: Actualizar el fixture y escribir el test que falla**

En `apps/server/src/modules/workspace/workspace.services.test.ts`, agregar `outcome: null` al fixture `runResult`:

```typescript
const runResult: AgentsRunResult = {
  outcome: null,
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  ...
```

Agregar dentro de `describe("escritura del resultado (db)", ...)`, después del test `"onResult cierra la ejecución..."`:

```typescript
  t("un turno de chat no borra los artefactos de un diseño previo", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    await makeDbSink(created.conversation.id, created.execution.id).onResult(runResult);

    const followUp = await appendUserMessage(TEST_USER_ID, created.conversation.id, "hola");
    await makeDbSink(created.conversation.id, followUp!.execution.id).onResult({
      ...runResult,
      outcome: { mode: "chat", reply: "¡Hola! ¿En qué circuito seguimos?" },
    });

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("completed");
    expect(detail!.execution.summary).toBe("¡Hola! ¿En qué circuito seguimos?");
    expect(detail!.files).toHaveLength(1);
  });
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test workspace.services.test.ts -t "no borra los artefactos"`
Expected: FAIL — hoy `onResult` siempre borra la tabla `artifact` antes de reinsertar, así que `detail!.files` queda en `0`.

(Si no hay `TEST_USER_ID` real disponible en este entorno, dejar este test escrito y saltar al Step 3 — el gate de `RUN_DB_TESTS` documentado en `CLAUDE.md` hace que quede skippeado, no roto; correrlo apenas haya credenciales.)

- [ ] **Step 3: Reescribir `onResult` en `workspace.services.ts`**

En `apps/server/src/modules/workspace/workspace.services.ts`, agregar el import:

```typescript
import {
  mapVerdictToStatus,
  resolveRunOutcome,
  toArtifactDrafts,
  toAssistantMessage,
  type AgentsRunResult,
  type RunSink,
} from "./workspace.runner";
```

y reemplazar el cuerpo de `onResult` dentro de `makeDbSink`:

```typescript
    async onResult(result: AgentsRunResult) {
      const outcome = resolveRunOutcome(result);

      await db.insert(message).values({
        conversationId,
        role: "assistant",
        content: outcome.assistantMessage,
      });

      // artifacts === null: turno de chat/clarify, no toca lo que ya había.
      if (outcome.artifacts !== null) {
        await db.delete(artifact).where(eq(artifact.conversationId, conversationId));
        if (outcome.artifacts.length > 0) {
          await db
            .insert(artifact)
            .values(outcome.artifacts.map((draft) => ({ conversationId, ...draft })));
        }
      }

      await db
        .update(execution)
        .set({
          status: outcome.status,
          summary: outcome.summary,
          verdict: result.verdict,
          normalizedSpec: outcome.normalizedSpec,
          history: result.history,
          finishedAt: new Date(),
        })
        .where(eq(execution.id, executionId));

      await db
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    },
```

Los imports `mapVerdictToStatus`, `toArtifactDrafts`, `toAssistantMessage` ya no se usan directamente en este archivo (quedan encapsulados dentro de `resolveRunOutcome`); quitarlos del import si el linter los marca sin uso.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd apps/server && bun test workspace.services.test.ts workspace.runner.test.ts`
Expected: PASS sin `RUN_DB_TESTS` (los tests de DB quedan skippeados, el resto corre). Si hay `TEST_USER_ID` real:

Run: `cd apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test workspace.services.test.ts`
Expected: PASS, incluido el test nuevo.

- [ ] **Step 5: Verificación final de todo el slice**

Run: `cd apps/agents && uv run pytest`
Expected: PASS, suite completa.

Run: `cd apps/server && bun test`
Expected: PASS, suite completa.

Run: `bun run --cwd apps/server typecheck`
Expected: sin errores — `AgentsRunResult`/`RunOutcome` bien tipados en todo el módulo.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/workspace/workspace.services.ts apps/server/src/modules/workspace/workspace.services.test.ts
git commit -m "fix(server): un turno de chat/clarify ya no borra los artefactos de la conversación"
```

---

## Nota fuera de alcance (no implementar acá)

Si un turno `chat` cae en medio de una conversación con un diseño ya resuelto, la fila de `execution` de ese turno guarda `normalizedSpec: null` (ver Task 5). Como `appendUserMessage` lee el `normalizedSpec` de la ejecución más reciente nada más, un siguiente pedido de ajuste ("ahora a 3.3V") no vería el spec previo — se perdería el contexto por culpa del saludo intermedio. Esto no estaba cubierto por el spec aprobado y no se resuelve en este plan; si aparece como problema real de uso, es un cambio acotado a `appendUserMessage`/`loadConversationParts` (buscar hacia atrás la última ejecución con `normalizedSpec` no nulo) que se puede planear aparte.

## Self-Review

- **Cobertura del spec:** Sección 1 (salida discriminada) → Task 1+2. Sección 2 (memoria entre aclaraciones) → cubierta por Task 5/6 reinyectando `partial_spec` en `execution.normalizedSpec`, que ya fluye a través de `composeRequestText` sin cambios en ese archivo. Sección 3 (ruteo del grafo) → Task 3+4. Sección 4 (mapeo servidor) → Task 5+6. Testing (spec) → cada task incluye sus tests correspondientes.
- **Placeholders:** ninguno; cada paso trae el código completo a escribir.
- **Consistencia de tipos:** `outcome.mode` se usa igual en Python (`"chat"|"clarify"|"design"`) y TypeScript (`AgentsOutcome`); `partial_spec`/`normalizedSpec` viajan como `unknown`/`dict` sin schema fijo en ambos lados, consistente con cómo ya se trata `normalized_spec` hoy.
