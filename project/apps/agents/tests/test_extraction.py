import pytest

from agents.llm.extraction import ExtractionError, extract_circuit_spec
from agents.orquestador.schema import CircuitSpec


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
        assert schema is CircuitSpec
        return _FakeStructuredModel(self._result)


FIXED_SPEC = CircuitSpec(
    blocks=[
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
    ]
)


def test_extract_circuit_spec_returns_parsed_spec():
    chat_model = _FakeChatModel(FIXED_SPEC)
    result = extract_circuit_spec(chat_model, "dame un divisor de 5V a 3.3V")
    assert result == FIXED_SPEC


def test_extract_circuit_spec_wraps_failures():
    chat_model = _FakeChatModel(RuntimeError("boom"))
    with pytest.raises(ExtractionError, match="boom"):
        extract_circuit_spec(chat_model, "algo")
