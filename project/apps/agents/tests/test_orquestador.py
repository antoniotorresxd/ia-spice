from agents.orquestador.node import orquestador_node, route_after_orquestador


def _state(circuit_spec):
    return {
        "circuit_spec": circuit_spec,
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
