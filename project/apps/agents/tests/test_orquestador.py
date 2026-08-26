import pytest

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
        ],
        "max_iterations": 5,
        "tolerance": 0.05,
    }
    from agents.orquestador.schema import CircuitSpec

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_circuit_spec",
        lambda chat_model, text: CircuitSpec.model_validate(fake_spec),
    )

    result = orquestador_node(
        _state(request_text="dame un divisor de 5V a 3.3V"),
        {"configurable": {"user_id": "user-1"}},
    )

    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
    assert result["circuit_spec"] == fake_spec
    assert result["pending_blocks"] == ["div1"]


def test_request_text_llm_settings_failure_is_rejected(monkeypatch):
    from agents.llm.settings_client import LlmSettingsError

    def _raise(user_id):
        raise LlmSettingsError("server unreachable: boom")

    monkeypatch.setattr(orquestador_module, "get_chat_model", _raise)

    result = orquestador_node(
        _state(request_text="algo"), {"configurable": {"user_id": "user-1"}}
    )

    assert result["verdict"]["status"] == "rejected"
    assert "llm_settings_unavailable" in result["verdict"]["reason"]


def test_request_text_extraction_failure_is_rejected(monkeypatch):
    from agents.llm.extraction import ExtractionError

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())

    def _raise(chat_model, text):
        raise ExtractionError("LLM returned garbage")

    monkeypatch.setattr(orquestador_module, "extract_circuit_spec", _raise)

    result = orquestador_node(
        _state(request_text="algo"), {"configurable": {"user_id": "user-1"}}
    )

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


def test_orquestador_pasa_user_id_y_agent_id_al_resolver_el_llm(monkeypatch):
    """El nodo debe pedir la config del agente 'orchestrator' para el usuario
    de la corrida, no una config global."""
    from agents.orquestador import node as node_module

    visto = {}

    def fake_fetch(agent_id, user_id):
        visto["agent_id"] = agent_id
        visto["user_id"] = user_id
        raise node_module.LlmSettingsError("cortocircuito intencional")

    monkeypatch.setattr(node_module, "fetch_agent_llm", fake_fetch)

    result = node_module.orquestador_node(
        {"request_text": "un divisor de voltaje de 5V a 2.5V"},
        {"configurable": {"user_id": "user-77"}},
    )

    assert visto == {"agent_id": "orchestrator", "user_id": "user-77"}
    assert result["verdict"]["status"] == "rejected"


def test_orquestador_rechaza_sin_user_id_en_la_config():
    from agents.orquestador import node as node_module

    result = node_module.orquestador_node(
        {"request_text": "un divisor de voltaje de 5V a 2.5V"},
        {"configurable": {}},
    )

    assert result["verdict"]["status"] == "rejected"
    assert "user_id" in result["verdict"]["reason"]


def test_orquestador_con_circuit_spec_no_necesita_user_id():
    """La ruta estructurada no usa LLM, así que no debe exigir identidad."""
    from agents.orquestador import node as node_module

    result = node_module.orquestador_node(
        {
            "circuit_spec": {
                "blocks": [
                    {
                        "id": "b1",
                        "type": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 2.5},
                    }
                ],
                "tolerance": 0.05,
                "max_iterations": 5,
            }
        },
        {"configurable": {}},
    )

    assert result.get("verdict") is None
    assert result["pending_blocks"] == ["b1"]


def test_max_iterations_and_tolerance_come_from_the_config(tmp_path, monkeypatch):
    """El RNF-04.2 dice que estos dos se ajustan sin tocar código. Antes vivían
    como valores por omisión del schema y la configuración no los gobernaba."""
    import yaml

    from agents.config import reset_config_cache
    from agents.orquestador.schema import CircuitSpec

    custom = tmp_path / "experimento.yaml"
    custom.write_text(
        yaml.safe_dump(
            {
                "curador": {
                    "weights": {"default": 1.0},
                    "beta": 10.0,
                    "gamma": 3.0,
                    "failed_ape": 100.0,
                    "expected_error_reduction": 0.7,
                    "reject_reward": -50.0,
                    "accept_tolerance_slack": 1.5,
                    "max_iterations": 9,
                    "tolerance": 0.02,
                },
                "calculo": {
                    "r1_default": 1000.0,
                    "r_rc_default": 1000.0,
                    "r_min": 1.0,
                    "perturb_factor": 1.05,
                },
                "llm": {"temperature": 0.0},
            }
        )
    )
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))
    reset_config_cache()
    try:
        spec = CircuitSpec.model_validate(
            {
                "blocks": [
                    {
                        "id": "div1",
                        "type": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 3.3},
                    }
                ]
            }
        )

        assert spec.max_iterations == 9
        assert spec.tolerance == 0.02
    finally:
        reset_config_cache()


def test_the_caller_can_still_override_what_the_config_proposes(tmp_path, monkeypatch):
    """La configuración pone el valor por omisión, no un techo: un spec que
    trae los suyos manda sobre ella."""
    from agents.orquestador.schema import CircuitSpec

    spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
            ],
            "max_iterations": 2,
            "tolerance": 0.1,
        }
    )

    assert spec.max_iterations == 2
    assert spec.tolerance == 0.1


def test_noninverting_amp_block_is_accepted_and_gets_its_goal():
    from agents.orquestador.node import _normalize
    from agents.orquestador.schema import CircuitSpec

    spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {
                    "id": "amp1",
                    "type": "noninverting_amp",
                    "params": {"v_in": 1.0, "v_out": 3.0},
                }
            ]
        }
    )
    result = _normalize(spec)
    block = result["normalized_spec"]["blocks"][0]

    assert block["type"] == "noninverting_amp"
    assert block["goal"]["metric"] == "v_out"
    assert block["goal"]["target"] == 3.0


def test_noninverting_amp_rejects_nonpositive_params():
    from pydantic import ValidationError

    from agents.orquestador.schema import CircuitSpec

    with pytest.raises(ValidationError):
        CircuitSpec.model_validate(
            {
                "blocks": [
                    {"id": "amp1", "type": "noninverting_amp", "params": {"v_in": 0.0, "v_out": 3.0}}
                ]
            }
        )


def test_generic_block_trae_su_propia_meta():
    from agents.orquestador.node import _normalize
    from agents.orquestador.schema import CircuitSpec

    spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {
                    "id": "sk1",
                    "type": "generic",
                    "params": {
                        "description": "filtro Sallen-Key pasa-bajas",
                        "metric": "f_c",
                        "target": 1000.0,
                        "netlist": "* x\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n",
                    },
                }
            ]
        }
    )

    block = _normalize(spec)["normalized_spec"]["blocks"][0]

    assert block["goal"]["metric"] == "f_c"
    assert block["goal"]["target"] == 1000.0
    assert block["goal"]["tolerance"] == 0.05


def test_generic_rechaza_un_netlist_que_no_mide_nada():
    from pydantic import ValidationError

    from agents.orquestador.schema import CircuitSpec

    with pytest.raises(ValidationError, match="output.txt"):
        CircuitSpec.model_validate(
            {
                "blocks": [
                    {
                        "id": "x",
                        "type": "generic",
                        "params": {
                            "description": "algo",
                            "metric": "v_out",
                            "target": 1.0,
                            "netlist": "* sin control\n.end\n",
                        },
                    }
                ]
            }
        )
