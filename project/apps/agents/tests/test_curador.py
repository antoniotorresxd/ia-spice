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
