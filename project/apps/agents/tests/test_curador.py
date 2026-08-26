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
        _state({"div1": {"metrics": {"v_out": 3.31}, "converged": True, "sim_error": None}})
    )

    assert result["verdict"]["status"] == "accepted"
    assert result["verdict"]["best_iteration"] == 0
    assert len(result["history"]) == 1
    assert result["history"][0]["decision"] == "accept"


def test_curador_adjusts_failing_block_and_stays_unverdicted():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}})
    )

    assert "verdict" not in result
    assert result["iteration"] == 1
    assert result["pending_blocks"] == ["div1"]
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_perturbs_on_sim_error_with_iterations_left():
    result = curador_node(_state({"div1": {"metrics": None, "converged": False, "sim_error": "boom"}}))

    assert "verdict" not in result
    assert result["component_values"]["div1"]["r2"] == pytest.approx(1050.0)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_rejects_when_iterations_exhausted():
    result = curador_node(
        _state(
            {"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}},
            iteration=4,
            max_iterations=5,
            history=[
                {"iteration": i, "decision": "adjust", "worst_rel_err": 1.0 - i * 0.1}
                for i in range(4)
            ],
        )
    )

    assert result["verdict"]["status"] == "rejected"
    # estos registros del history solo traen worst_rel_err, no reward, así que
    # _best_iteration los descarta y el actual queda como único candidato
    assert result["verdict"]["best_iteration"] == 4


def test_curador_rejects_with_diagnosis_when_sim_error_and_no_iterations_left():
    result = curador_node(
        _state({"div1": {"metrics": None, "converged": False, "sim_error": "boom"}}, iteration=4)
    )

    assert result["verdict"]["status"] == "rejected"
    assert "boom" in result["verdict"]["reason"]


def test_route_after_curador():
    assert route_after_curador({"verdict": None}) == "adjust"
    assert route_after_curador({"verdict": {"status": "accepted"}}) == "done"


from agents.curador.policy import (
    accept_is_admissible,
    choose_action,
    estimate_action_rewards,
    observed_reduction,
)

POLICY_CFG = {
    "curador": {
        "weights": {"default": 1.0},
        "beta": 10.0,
        "gamma": 3.0,
        "failed_ape": 100.0,
        "expected_error_reduction": 0.7,
        "reject_reward": -50.0,
        "accept_tolerance_slack": 1.5,
    }
}


def test_estimate_action_rewards_projects_the_adjustment():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)], converged=True, iteration=0, config=POLICY_CFG
    )

    # accept: -20 + 10 - 0 = -10
    assert rewards["accept"] == pytest.approx(-10.0)
    # adjust: -(20*0.7) + 10 - 3 = -14 + 7 = -7
    assert rewards["adjust"] == pytest.approx(-7.0)
    assert rewards["reject"] == pytest.approx(-50.0)


def test_estimate_action_rewards_prefers_the_observed_reduction():
    rewards = estimate_action_rewards(
        [("v_out", 20.0)],
        converged=True,
        iteration=0,
        config=POLICY_CFG,
        reduction=0.5,
    )

    # adjust con ρ=0.5: -(20*0.5) + 10 - 3 = -3
    assert rewards["adjust"] == pytest.approx(-3.0)


def test_choose_action_adjusts_when_the_error_is_large():
    # A=24.24 supera el umbral γ/(1-ρ) = 10
    rewards = estimate_action_rewards(
        [("v_out", 24.24)], converged=True, iteration=0, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=True) == "adjust"


def test_choose_action_accepts_early_when_one_more_iteration_costs_more_than_it_gains():
    # A=7.0 queda por debajo del umbral: ajustar cuesta más de lo que quita
    rewards = estimate_action_rewards(
        [("v_out", 7.0)], converged=True, iteration=0, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=True) == "accept"


def test_choose_action_rejects_when_there_are_no_iterations_left():
    rewards = estimate_action_rewards(
        [("v_out", 24.24)], converged=True, iteration=4, config=POLICY_CFG
    )

    assert choose_action(rewards, adjust_available=False) == "reject"


def test_choose_action_breaks_the_exact_boundary_tie_toward_accepting():
    """En A = γ/(1-ρ) = 10 las dos acciones empatan. Se acepta: gastar una
    iteración que no mejora la recompensa no tiene sentido."""
    rewards = estimate_action_rewards(
        [("v_out", 10.0)], converged=True, iteration=0, config=POLICY_CFG
    )

    assert rewards["accept"] == pytest.approx(rewards["adjust"])
    assert choose_action(rewards, adjust_available=True) == "accept"


def test_choose_action_keeps_adjusting_when_accepting_is_not_admissible():
    """Con ρ saturado en 1.0 aceptar gana siempre por -γ, sin importar el
    error. La barandilla impide que eso declare aceptado un circuito lejísimos
    de la meta."""
    rewards = estimate_action_rewards(
        [("v_out", 200.0)], converged=True, iteration=1, config=POLICY_CFG, reduction=1.0
    )

    assert rewards["accept"] > rewards["adjust"]
    assert choose_action(rewards, adjust_available=True) == "accept"
    assert choose_action(rewards, adjust_available=True, accept_admissible=False) == "adjust"


def test_observed_reduction_is_the_ratio_of_the_last_two_iterations():
    history = [{"weighted_ape": 40.0}, {"weighted_ape": 10.0}]

    assert observed_reduction(history) == pytest.approx(0.25)


def test_observed_reduction_is_unavailable_with_a_single_iteration():
    assert observed_reduction([{"weighted_ape": 40.0}]) is None


def test_observed_reduction_never_exceeds_one():
    # el error empeoró: no se puede prometer una reducción
    history = [{"weighted_ape": 10.0}, {"weighted_ape": 40.0}]

    assert observed_reduction(history) == pytest.approx(1.0)


def test_curador_records_the_reward_and_the_action_rewards():
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}})
    )

    record = result["history"][0]
    assert record["converged"] is True
    assert record["weighted_ape"] == pytest.approx(100.0 * 0.8 / 3.3)
    # accept = -A + β - γ·0
    assert record["reward"] == pytest.approx(-record["weighted_ape"] + 10.0)
    assert set(record["action_rewards"]) == {"accept", "adjust", "reject"}


def test_curador_accepts_early_when_adjusting_costs_more_than_it_gains():
    # 3.10 contra una meta de 3.3 es un 6.06 % de error: fuera de la tolerancia
    # del 5 %, pero por debajo del umbral γ/(1-ρ) = 10 puntos. Las reglas
    # anteriores habrían seguido ajustando; la política acepta.
    result = curador_node(
        _state({"div1": {"metrics": {"v_out": 3.10}, "converged": True, "sim_error": None}})
    )

    assert result["verdict"]["status"] == "accepted"
    assert result["history"][0]["decision"] == "accept"
    assert "recompensa" in result["verdict"]["reason"]


def test_curador_marks_the_block_as_not_converged_when_the_simulation_failed():
    result = curador_node(
        _state({"div1": {"metrics": None, "converged": False, "sim_error": "boom"}})
    )

    assert result["history"][0]["converged"] is False
    # APE imputado de 100 y sin premio de convergencia
    assert result["history"][0]["reward"] == pytest.approx(-100.0)


def test_best_iteration_is_the_one_with_the_highest_reward():
    result = curador_node(
        _state(
            {"div1": {"metrics": {"v_out": 2.5}, "converged": True, "sim_error": None}},
            iteration=4,
            max_iterations=5,
            history=[
                {"iteration": 0, "decision": "adjust", "reward": -50.0, "weighted_ape": 60.0},
                {"iteration": 1, "decision": "adjust", "reward": -5.0, "weighted_ape": 12.0},
                {"iteration": 2, "decision": "adjust", "reward": -40.0, "weighted_ape": 47.0},
                {"iteration": 3, "decision": "adjust", "reward": -45.0, "weighted_ape": 52.0},
            ],
        )
    )

    assert result["verdict"]["status"] == "rejected"
    assert result["verdict"]["best_iteration"] == 1


def _block(tolerance):
    return {"id": "b1", "goal": {"metric": "v_out", "target": 3.3, "tolerance": tolerance}}


def test_accept_is_admissible_within_the_slack_over_the_declared_tolerance():
    # 6.06 % de error contra una tolerancia del 5 %: 1.21 veces, cabe en 1.5
    assert accept_is_admissible([_block(0.05)], {"b1": ("off", 0.0606)}, POLICY_CFG)


def test_accept_is_not_admissible_beyond_the_slack():
    # 24 % contra 5 %: casi cinco veces la tolerancia
    assert not accept_is_admissible([_block(0.05)], {"b1": ("off", 0.2424)}, POLICY_CFG)


def test_admissibility_scales_with_each_blocks_own_tolerance():
    """El mismo error absoluto se juzga distinto según lo estricta que sea la
    meta. Es la regresión que atrapó test_graph.py: el LED declara tolerancia
    del 1 % y cae 5.9 % fuera; un tope global en puntos de APE lo habría dado
    por bueno incumpliendo su meta por casi seis veces."""
    evaluations = {"b1": ("off", 0.0589)}

    assert accept_is_admissible([_block(0.05)], evaluations, POLICY_CFG)
    assert not accept_is_admissible([_block(0.01)], evaluations, POLICY_CFG)


def test_accept_is_never_admissible_when_a_block_could_not_be_measured():
    assert not accept_is_admissible([_block(0.05)], {"b1": ("error", None)}, POLICY_CFG)


def test_accept_needs_every_block_to_be_admissible():
    blocks = [
        {"id": "b1", "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05}},
        {"id": "b2", "goal": {"metric": "f_c", "target": 1000.0, "tolerance": 0.05}},
    ]
    evaluations = {"b1": ("off", 0.06), "b2": ("off", 0.40)}

    assert not accept_is_admissible(blocks, evaluations, POLICY_CFG)


def _two_block_state(sim_results):
    """Dos bloques con tolerancias muy distintas: 5 % y 0.1 %."""
    return {
        "circuit_spec": {},
        "request_text": None,
        "normalized_spec": {
            "blocks": [
                {
                    "id": "holgado",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "estricto",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.001},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["holgado", "estricto"],
        "component_values": {
            "holgado": {"r1": 1000.0, "r2": 1000.0},
            "estricto": {"r1": 1000.0, "r2": 1000.0},
        },
        "netlists": {},
        "sim_results": sim_results,
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def _measured(value):
    return {"metrics": {"v_out": value}, "converged": True, "sim_error": None}


def test_curador_will_not_accept_while_any_block_is_inadmissible():
    """La barandilla, probada donde de verdad vive: en el nodo.

    Los dos bloques suman 8 puntos de APE ponderado, por debajo del umbral
    γ/(1-ρ)=10, así que la recompensa prefiere aceptar. Pero `estricto` declara
    una tolerancia del 0.1 % y se desvía 2 %: veinte veces su meta. Aceptar
    dejaría de ser honesto, así que se sigue ajustando.
    """
    # 3.102 -> 6 % de error (tolerancia 5 %: fuera, pero dentro del margen 1.5)
    # 3.234 -> 2 % de error (tolerancia 0.1 %: veinte veces fuera)
    result = curador_node(
        _two_block_state({"holgado": _measured(3.102), "estricto": _measured(3.234)})
    )

    record = result["history"][0]
    assert record["weighted_ape"] == pytest.approx(8.0)
    # la recompensa, por sí sola, habría aceptado
    assert record["action_rewards"]["accept"] > record["action_rewards"]["adjust"]
    # pero la admisibilidad manda
    assert record["decision"] == "adjust"
    assert "verdict" not in result
    assert sorted(result["pending_blocks"]) == ["estricto", "holgado"]


def test_curador_accepts_by_reward_when_every_block_is_admissible():
    """El contraste: mismo error ponderado, pero ahora los dos bloques caben en
    el margen de su propia tolerancia. Sin la barandilla de por medio, la
    recompensa decide y acepta."""
    # 3.102 -> 6 % con tolerancia 5 %; 3.366 -> 2 % con tolerancia... también 5 %
    state = _two_block_state({"holgado": _measured(3.102), "estricto": _measured(3.366)})
    state["normalized_spec"]["blocks"][1]["goal"]["tolerance"] = 0.05

    result = curador_node(state)

    assert result["history"][0]["weighted_ape"] == pytest.approx(8.0)
    assert result["verdict"]["status"] == "accepted"
    assert "recompensa" in result["verdict"]["reason"]


def test_converged_is_false_when_any_block_failed_to_simulate():
    """`c` de la fórmula es un all() sobre los bloques: basta uno sin medir."""
    result = curador_node(
        _two_block_state(
            {
                "holgado": _measured(3.30),
                "estricto": {"metrics": None, "converged": False, "sim_error": "boom"},
            }
        )
    )

    assert result["history"][0]["converged"] is False


def test_adjust_noninverting_amp_solves_rf_exactly():
    # v_out = v_in·(rg+rf)/rg. Con rg=1k, rf=2k la salida es 3·v_in; para
    # llevar 3.0 medido a 4.0 objetivo hace falta rf = (1k+2k)·4/3 - 1k = 3k
    values = ADJUST_RULES["noninverting_amp"](
        {"rg": 1000.0, "rf": 2000.0}, target=4.0, actual=3.0
    )

    assert values["rf"] == pytest.approx(3000.0)
    assert values["rg"] == 1000.0


def test_adjust_noninverting_amp_guards_against_nonpositive_actual():
    values = ADJUST_RULES["noninverting_amp"](
        {"rg": 1000.0, "rf": 2000.0}, target=4.0, actual=0.0
    )

    assert values["rf"] == pytest.approx(4000.0)
