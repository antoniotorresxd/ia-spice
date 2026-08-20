import pytest

from agents.curador.reward import (
    build_measurements,
    compute_reward,
    weight_for,
    weighted_ape,
)

CFG = {
    "curador": {
        "weights": {"default": 1.0, "v_out": 2.0},
        "beta": 10.0,
        "gamma": 3.0,
        "failed_ape": 100.0,
    }
}


def test_weight_for_uses_the_specific_weight_when_present():
    assert weight_for("v_out", CFG) == 2.0


def test_weight_for_falls_back_to_default():
    assert weight_for("f_c", CFG) == 1.0


def test_build_measurements_converts_relative_error_to_percentage_points():
    blocks = [{"id": "div1", "goal": {"metric": "v_out"}}]
    evaluations = {"div1": ("off", 0.25)}

    assert build_measurements(blocks, evaluations, CFG) == [("v_out", 25.0)]


def test_build_measurements_imputes_failed_ape_when_there_is_no_measurement():
    blocks = [{"id": "div1", "goal": {"metric": "v_out"}}]
    evaluations = {"div1": ("error", None)}

    assert build_measurements(blocks, evaluations, CFG) == [("v_out", 100.0)]


def test_weighted_ape_applies_the_per_metric_weight():
    # v_out pesa 2.0, f_c usa el default 1.0
    assert weighted_ape([("v_out", 10.0), ("f_c", 5.0)], CFG) == pytest.approx(25.0)


def test_compute_reward_matches_the_thesis_formula():
    # R = -(2.0*10.0) + 10.0*1 - 3.0*2 = -20 + 10 - 6 = -16
    result = compute_reward([("v_out", 10.0)], converged=True, iteration=2, config=CFG)

    assert result == pytest.approx(-16.0)


def test_compute_reward_drops_the_beta_term_when_it_did_not_converge():
    # R = -(2.0*10.0) + 0 - 3.0*0 = -20
    result = compute_reward([("v_out", 10.0)], converged=False, iteration=0, config=CFG)

    assert result == pytest.approx(-20.0)


def test_compute_reward_with_no_measurements_is_just_convergence_and_iteration():
    assert compute_reward([], converged=True, iteration=1, config=CFG) == pytest.approx(7.0)


def test_a_perfect_circuit_on_the_first_iteration_scores_beta():
    assert compute_reward([("v_out", 0.0)], converged=True, iteration=0, config=CFG) == pytest.approx(10.0)
