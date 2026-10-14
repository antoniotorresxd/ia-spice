import pytest

from agents.llm.extraction import (
    GUIA_MODO_ANALISIS,
    NOTA_IMAGENES,
    ExtractionError,
    ImageInputError,
    extract_orchestrator_outcome,
)
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
        {
            "id": "div1",
            "type": "catalog",
            "params": {
                "circuit_id": "voltage_divider",
                "params": {"v_in": 5.0, "v_out": 3.3},
                "requirements": [{"measure": "vout", "value": 3.3}],
            },
        }
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


@pytest.mark.parametrize("context", ["catálogo explícito", "", None])
def test_extract_compiles_catalog_into_system_prompt(monkeypatch, context):
    fixed = OrchestratorResult(outcome=ChatOutcome(mode="chat", reply="¡Hola!"))
    seen = []
    messages_seen = []

    def fetch_prompt(name, **kwargs):
        seen.append((name, kwargs))
        return "System prompt compilado"

    def unavailable_catalog():
        raise RuntimeError("catalog unavailable")

    def invoke(self, messages):
        messages_seen.extend(messages)
        return fixed

    monkeypatch.setattr("agents.llm.extraction.fetch_prompt", fetch_prompt)
    monkeypatch.setattr("agents.knowledge.circuit_client.fetch_circuit_catalog", unavailable_catalog)
    monkeypatch.setattr(_FakeStructuredModel, "invoke", invoke)

    assert extract_orchestrator_outcome(_FakeChatModel(fixed), "hola", context) == fixed.outcome
    assert seen == [(
        "orquestador-system",
        {"retrieved_circuits_catalog": (context or "(catálogo no disponible)") + "\n\n" + GUIA_MODO_ANALISIS},
    )]
    assert messages_seen == [
        {"role": "system", "content": "System prompt compilado"},
        {"role": "user", "content": "hola"},
    ]


@pytest.fixture(autouse=True)
def _fake_prompt(monkeypatch):
    monkeypatch.setattr("agents.llm.extraction.fetch_prompt", lambda name, **kwargs: "System prompt de prueba")


def test_la_guia_de_analisis_pide_no_agregar_la_fuente_de_prueba():
    # Caso real: el LLM metió la "fuente de prueba de 1 V" del enunciado de un
    # terminal a tierra con el otro al aire, y la red quedó sin corriente.
    assert "NO agregues una fuente de prueba" in GUIA_MODO_ANALISIS
    assert "entre los `terminales`" in GUIA_MODO_ANALISIS


def test_la_guia_de_analisis_pide_no_inventar_tierra_ni_reducir():
    # Caso real: sin nodo 0, el LLM colgó una R7 de tierra para que la red se
    # leyera y juntó 50 Ω ∥ 200 Ω en una sola de 40 Ω, borrando ese paso.
    assert "NO inventes una" in GUIA_MODO_ANALISIS
    assert "NO\n  combines" in GUIA_MODO_ANALISIS


def test_la_guia_de_analisis_prohibe_inventar_valores_de_incognitas():
    # Caso real (Franco P1.4): con Ri, Ag y Ro como incógnitas, el LLM las
    # transcribió con valores inventados (RI 100k, Gm 1.84, RO 100).
    assert "NUNCA inventes" in GUIA_MODO_ANALISIS
    assert "incógnita" in GUIA_MODO_ANALISIS


# --- Fase 7: imágenes de entrada -------------------------------------------

PNG = {"media_type": "image/png", "data": "iVBORw0KGgo="}
JPEG = {"media_type": "image/jpeg", "data": "/9j/4AAQ"}


def _capturing(monkeypatch, result):
    messages_seen = []

    def invoke(self, messages):
        messages_seen.extend(messages)
        if isinstance(self._result, Exception):
            raise self._result
        return self._result

    monkeypatch.setattr(_FakeStructuredModel, "invoke", invoke)
    return messages_seen


def test_con_imagenes_el_mensaje_del_usuario_es_multimodal(monkeypatch):
    fixed = OrchestratorResult(outcome=ChatOutcome(mode="chat", reply="ok"))
    messages_seen = _capturing(monkeypatch, fixed)

    outcome = extract_orchestrator_outcome(
        _FakeChatModel(fixed), "resuelve la Fig. P2.7", "catálogo", images=[PNG, JPEG]
    )

    assert outcome == fixed.outcome
    system, user = messages_seen
    assert system == {"role": "system", "content": "System prompt de prueba"}
    assert user["role"] == "user"
    content = user["content"]
    assert content[0] == {"type": "text", "text": "resuelve la Fig. P2.7"}
    # la nota sobre las figuras va como texto aparte, antes de las imágenes
    assert content[1] == {"type": "text", "text": NOTA_IMAGENES}
    assert content[2:] == [
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgo="}},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ"}},
    ]


def test_la_nota_de_imagenes_pide_transcribir_la_figura_sin_inventar():
    assert "figura" in NOTA_IMAGENES
    assert "transcribe" in NOTA_IMAGENES.lower()
    assert "NUNCA inventes" in NOTA_IMAGENES


@pytest.mark.parametrize("images", [None, []])
def test_sin_imagenes_el_mensaje_del_usuario_sigue_siendo_texto(monkeypatch, images):
    fixed = OrchestratorResult(outcome=ChatOutcome(mode="chat", reply="ok"))
    messages_seen = _capturing(monkeypatch, fixed)

    extract_orchestrator_outcome(_FakeChatModel(fixed), "hola", "catálogo", images=images)

    assert messages_seen[1] == {"role": "user", "content": "hola"}


def test_un_modelo_que_rechaza_imagenes_falla_con_un_mensaje_claro(monkeypatch):
    _capturing(monkeypatch, None)
    chat_model = _FakeChatModel(RuntimeError("Invalid content type: image_url is not supported"))

    with pytest.raises(ImageInputError, match="imágenes") as excinfo:
        extract_orchestrator_outcome(chat_model, "resuelve la figura", "catálogo", images=[PNG])

    # sigue siendo un ExtractionError: quien solo conoce ese tipo lo atrapa igual
    assert isinstance(excinfo.value, ExtractionError)
    assert "image_url is not supported" in str(excinfo.value)


def test_la_guia_manda_los_ejercicios_de_libro_a_planteamientos():
    # Caso real (Franco P1.9): "Design a noninverting amplifier whose gain is
    # variable over 1 ≤ A ≤ 5 by means of a 100-k pot" se fue a mode='design',
    # que no sabe de potenciómetros, y falló dos veces.
    assert "Design a noninverting amplifier" in GUIA_MODO_ANALISIS
    assert "{k*100k}" in GUIA_MODO_ANALISIS
    assert "incisos" in GUIA_MODO_ANALISIS
