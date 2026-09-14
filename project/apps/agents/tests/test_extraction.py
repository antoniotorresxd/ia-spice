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
        {
            "id": "div1",
            "type": "catalog",
            "params": {
                "circuit_id": "voltage_divider",
                "params": {"v_in": 5.0, "v_out": 3.3},
                "metric": "vout",
                "target": 3.3,
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
        {"retrieved_circuits_catalog": context or "(catálogo no disponible)"},
    )]
    assert messages_seen == [
        {"role": "system", "content": "System prompt compilado"},
        {"role": "user", "content": "hola"},
    ]


@pytest.fixture(autouse=True)
def _fake_prompt(monkeypatch):
    monkeypatch.setattr("agents.llm.extraction.fetch_prompt", lambda name, **kwargs: "System prompt de prueba")
