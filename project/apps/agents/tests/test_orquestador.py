from agents.orquestador.node import orquestador_node, route_after_orquestador


def _state(circuit_spec=None, request_text=None):
    return {
        "circuit_spec": circuit_spec or {},
        "request_text": request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


VALID_SPEC = {
    "blocks": [
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
        {"id": "led1", "type": "led_resistor", "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02}},
    ]
}


def test_valid_spec_produces_normalized_spec_with_defaults():
    result = orquestador_node(_state(VALID_SPEC))

    spec = result["normalized_spec"]
    assert spec["max_iterations"] == 5
    assert [b["id"] for b in spec["blocks"]] == ["div1", "led1"]
    div = spec["blocks"][0]
    assert div["goal"] == {"metric": "v_out", "target": 3.3, "tolerance": 0.05}
    led = spec["blocks"][1]
    assert led["goal"] == {"metric": "i_led", "target": 0.02, "tolerance": 0.05}
    assert result["pending_blocks"] == ["div1", "led1"]
    assert result["iteration"] == 0


def test_spec_overrides_max_iterations_and_tolerance():
    spec_in = {**VALID_SPEC, "max_iterations": 3, "tolerance": 0.01}
    result = orquestador_node(_state(spec_in))

    assert result["normalized_spec"]["max_iterations"] == 3
    assert result["normalized_spec"]["blocks"][0]["goal"]["tolerance"] == 0.01


def test_invalid_spec_sets_rejected_verdict_without_raising():
    result = orquestador_node(_state({"blocks": [{"id": "x", "type": "nope", "params": {}}]}))

    assert result["verdict"]["status"] == "rejected"
    assert "circuit_spec" in result["verdict"]["reason"]


def test_empty_blocks_rejected():
    result = orquestador_node(_state({"blocks": []}))
    assert result["verdict"]["status"] == "rejected"


def test_duplicate_block_ids_rejected():
    dup = {
        "blocks": [
            {"id": "b1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
            {"id": "b1", "type": "rc_lowpass", "params": {"f_c": 1000.0}},
        ]
    }
    result = orquestador_node(_state(dup))
    assert result["verdict"]["status"] == "rejected"


def test_route_after_orquestador():
    assert route_after_orquestador({"verdict": None}) == "continue"
    assert route_after_orquestador({"verdict": {"status": "rejected"}}) == "reject"


from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module


def test_request_text_uses_llm_to_produce_normalized_spec(monkeypatch):
    fake_spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ]
    }
    from agents.orquestador.schema import CircuitSpec

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_circuit_spec",
        lambda chat_model, text: CircuitSpec.model_validate(fake_spec),
    )

    result = orquestador_node(_state(request_text="dame un divisor de 5V a 3.3V"))

    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
    assert result["circuit_spec"] == fake_spec
    assert result["pending_blocks"] == ["div1"]


def test_request_text_llm_settings_failure_is_rejected(monkeypatch):
    from agents.llm.settings_client import LlmSettingsError

    def _raise():
        raise LlmSettingsError("server unreachable: boom")

    monkeypatch.setattr(orquestador_module, "get_chat_model", _raise)

    result = orquestador_node(_state(request_text="algo"))

    assert result["verdict"]["status"] == "rejected"
    assert "llm_settings_unavailable" in result["verdict"]["reason"]


def test_request_text_extraction_failure_is_rejected(monkeypatch):
    from agents.llm.extraction import ExtractionError

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda: MagicMock())

    def _raise(chat_model, text):
        raise ExtractionError("LLM returned garbage")

    monkeypatch.setattr(orquestador_module, "extract_circuit_spec", _raise)

    result = orquestador_node(_state(request_text="algo"))

    assert result["verdict"]["status"] == "rejected"
    assert "llm_extraction_failed" in result["verdict"]["reason"]


def test_no_input_at_all_is_rejected():
    result = orquestador_node(_state())

    assert result["verdict"]["status"] == "rejected"
    assert "no input" in result["verdict"]["reason"]


def test_circuit_spec_path_still_works_when_request_text_is_none():
    # camino estructurado (Task 2 de la iteracion 2), intacto
    result = orquestador_node(_state(circuit_spec=VALID_SPEC))
    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
