import pytest

from agents.curador.policy import ADJUST_RULES, evaluate_block, perturb


GOAL = {"metric": "v_out", "target": 3.3, "tolerance": 0.05}


def test_evaluate_block_ok_within_tolerance():
    status, rel_err = evaluate_block(GOAL, {"metrics": {"v_out": 3.31}, "sim_error": None})
    assert status == "ok"
    assert rel_err == pytest.approx(0.01 / 3.3)


def test_evaluate_block_off_outside_tolerance():
    status, rel_err = evaluate_block(GOAL, {"metrics": {"v_out": 4.0}, "sim_error": None})
    assert status == "off"
    assert rel_err > 0.05


def test_evaluate_block_error_when_sim_failed():
    status, rel_err = evaluate_block(GOAL, {"metrics": None, "sim_error": "boom"})
    assert status == "error"
    assert rel_err is None


def test_adjust_voltage_divider_scales_r2_toward_target():
    values = ADJUST_RULES["voltage_divider"](
        {"r1": 1000.0, "r2": 1000.0}, target=3.3, actual=2.5
    )
    assert values["r2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert values["r1"] == 1000.0


def test_adjust_rc_lowpass_scales_c():
    values = ADJUST_RULES["rc_lowpass"](
        {"r": 1000.0, "c": 1e-7}, target=1000.0, actual=1200.0
    )
    assert values["c"] == pytest.approx(1e-7 * 1200.0 / 1000.0)


def test_adjust_led_resistor_scales_r():
    values = ADJUST_RULES["led_resistor"]({"r": 150.0}, target=0.02, actual=0.0188)
    assert values["r"] == pytest.approx(150.0 * 0.0188 / 0.02)


def test_adjust_rules_guard_against_nonpositive_actual():
    v = ADJUST_RULES["voltage_divider"]({"r1": 1000.0, "r2": 500.0}, target=3.3, actual=0.0)
    assert v["r2"] == 1000.0  # duplica en vez de dividir por cero


def test_perturb_scales_all_values():
    assert perturb({"r": 100.0, "c": 2.0}) == {"r": 105.0, "c": 2.1}


from agents.curador.node import curador_node, route_after_curador


def _state(sim_results, iteration=0, max_iterations=5, history=None):
    return {
        "circuit_spec": {},
        "request_text": None,
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
            "max_iterations": max_iterations,
        },
        "pending_blocks": ["div1"],
        "component_values": {"div1": {"r1": 1000.0, "r2": 1000.0}},
        "netlists": {},
        "sim_results": sim_results,
        "iteration": iteration,
        "history": history or [],
        "verdict": None,
    }


def test_curador_accepts_when_all_blocks_within_tolerance():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 3.31}, "sim_error": None}})
    )

    assert result["verdict"]["status"] == "accepted"
    assert result["verdict"]["best_iteration"] == 0
    assert len(result["history"]) == 1
    assert result["history"][0]["decision"] == "accept"


def test_curador_adjusts_failing_block_and_stays_unverdicted():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "sim_error": None}})
    )

    assert "verdict" not in result
    assert result["iteration"] == 1
    assert result["pending_blocks"] == ["div1"]
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_perturbs_on_sim_error_with_iterations_left():
    result = curador_node(_state({"div1": {"metrics": None, "sim_error": "boom"}}))

    assert "verdict" not in result
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1050.0)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_rejects_when_iterations_exhausted():
    result = curador_node(
        _state(
            {"div1": {"metrics": {"v_out": 2.5}, "sim_error": None}},
            iteration=4,
            max_iterations=5,
            history=[
                {"iteration": i, "decision": "adjust", "worst_rel_err": 1.0 - i * 0.1}
                for i in range(4)
            ],
        )
    )

    assert result["verdict"]["status"] == "rejected"
    # la mejor iteración según worst_rel_err es la del registro actual o
    # la mínima del history; aquí history[3] tiene 0.7 y la actual ~0.24
    assert result["verdict"]["best_iteration"] == 4


def test_curador_rejects_with_diagnosis_when_sim_error_and_no_iterations_left():
    result = curador_node(
        _state({"div1": {"metrics": None, "sim_error": "boom"}}, iteration=4)
    )

    assert result["verdict"]["status"] == "rejected"
    assert "boom" in result["verdict"]["reason"]


def test_route_after_curador():
    assert route_after_curador({"verdict": None}) == "adjust"
    assert route_after_curador({"verdict": {"status": "accepted"}}) == "done"
