import pytest

from agents.curador.policy import ADJUST_RULES, evaluate_requirement, perturb


REQUIREMENT = {"measure": "v_out", "value": 3.3, "tolerance": 0.05}


def test_evaluate_requirement_ok_within_tolerance():
    status, rel_err = evaluate_requirement(REQUIREMENT, {"metrics": {"v_out": 3.31}, "sim_error": None})
    assert status == "ok"
    assert rel_err == pytest.approx(0.01 / 3.3)


def test_evaluate_requirement_off_outside_tolerance():
    status, rel_err = evaluate_requirement(REQUIREMENT, {"metrics": {"v_out": 4.0}, "sim_error": None})
    assert status == "off"
    assert rel_err > 0.05


def test_evaluate_requirement_error_when_sim_failed():
    status, rel_err = evaluate_requirement(REQUIREMENT, {"metrics": None, "sim_error": "boom"})
    assert status == "error"
    assert rel_err is None


def test_evaluate_requirement_gain_inverting_magnitude():
    gain_requirement = {"measure": "gain", "value": 100.0, "tolerance": 0.05}
    # En amplificador inversor BJT, la ganancia simulada sale negativa (-99.78)
    status, rel_err = evaluate_requirement(gain_requirement, {"metrics": {"gain": -99.78}, "sim_error": None})
    assert status == "ok"
    assert rel_err == pytest.approx(0.22 / 100.0)


def test_adjust_catalog_scales_r2_toward_target():
    values = ADJUST_RULES["catalog"](
        {"R1": 1000.0, "R2": 1000.0}, target=3.3, actual=2.5
    )
    assert values["R2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert values["R1"] == 1000.0


def test_adjust_catalog_zener_scales_rz():
    values = ADJUST_RULES["catalog"](
        {"RZ": 100.0, "RL": 180.0}, target=9.0, actual=10.0
    )
    assert values["RZ"] == pytest.approx(100.0 / (9.0 / 10.0))


def test_adjust_rules_guard_against_nonpositive_actual():
    v = ADJUST_RULES["catalog"]({"R1": 1000.0, "R2": 500.0}, target=3.3, actual=0.0)
    assert v["R2"] == 525.0


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
                    "type": "catalog",
                    "params": {
                        "circuit_id": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 3.3},
                        "requirements": [{"measure": "v_out", "value": 3.3}],
                    },
                    "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.05}],
                },
            ],
            "max_iterations": max_iterations,
        },
        "pending_blocks": ["div1"],
        "component_values": {"div1": {"R1": 1000.0, "R2": 1000.0}},
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
    assert result["component_values"]["div1"]["R2"] == pytest.approx(1000.0 * 3.3 / 2.5)
    assert result["history"][0]["decision"] == "adjust"


def test_curador_perturbs_on_sim_error_with_iterations_left():
    result = curador_node(_state({"div1": {"metrics": None, "converged": False, "sim_error": "boom"}}))

    assert "verdict" not in result
    assert result["component_values"]["div1"]["R2"] == pytest.approx(1050.0)
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


def _requirement(tolerance):
    return ("b1", 0, tolerance)


def test_accept_is_admissible_within_the_slack_over_the_declared_tolerance():
    # 6.06 % de error contra una tolerancia del 5 %: 1.21 veces, cabe en 1.5
    assert accept_is_admissible([_requirement(0.05)], {("b1", 0): ("off", 0.0606)}, POLICY_CFG)


def test_accept_is_not_admissible_beyond_the_slack():
    # 24 % contra 5 %: casi cinco veces la tolerancia
    assert not accept_is_admissible([_requirement(0.05)], {("b1", 0): ("off", 0.2424)}, POLICY_CFG)


def test_admissibility_scales_with_each_blocks_own_tolerance():
    """El mismo error absoluto se juzga distinto según lo estricta que sea la
    meta. Es la regresión que atrapó test_graph.py: el LED declara tolerancia
    del 1 % y cae 5.9 % fuera; un tope global en puntos de APE lo habría dado
    por bueno incumpliendo su meta por casi seis veces."""
    evaluations = {("b1", 0): ("off", 0.0589)}

    assert accept_is_admissible([_requirement(0.05)], evaluations, POLICY_CFG)
    assert not accept_is_admissible([_requirement(0.01)], evaluations, POLICY_CFG)


def test_accept_is_never_admissible_when_a_block_could_not_be_measured():
    assert not accept_is_admissible([_requirement(0.05)], {("b1", 0): ("error", None)}, POLICY_CFG)


def test_accept_needs_every_block_to_be_admissible():
    blocks = [
        ("b1", 0, 0.05),
        ("b2", 0, 0.05),
    ]
    evaluations = {("b1", 0): ("off", 0.06), ("b2", 0): ("off", 0.40)}

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
                    "type": "catalog",
                    "params": {
                        "circuit_id": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 3.3},
                        "requirements": [{"measure": "v_out", "value": 3.3}],
                    },
                    "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.05}],
                },
                {
                    "id": "estricto",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 3.3},
                        "requirements": [{"measure": "v_out", "value": 3.3}],
                    },
                    "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.001}],
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["holgado", "estricto"],
        "component_values": {
            "holgado": {"R1": 1000.0, "R2": 1000.0},
            "estricto": {"R1": 1000.0, "R2": 1000.0},
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
    state["normalized_spec"]["blocks"][1]["requirements"][0]["tolerance"] = 0.05

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




def _generic_state(netlist, sim_results, iteration=0, max_iterations=5):
    return {
        "circuit_spec": {},
        "request_text": None,
        "normalized_spec": {
            "blocks": [
                {
                    "id": "gen1",
                    "type": "generic",
                    "params": {
                        "description": "algo fuera del catálogo",
                        "requirements": [{"measure": "v_out", "value": 5.0}],
                    },
                    "requirements": [{"measure": "v_out", "value": 5.0, "tolerance": 0.05}],
                },
            ],
            "max_iterations": max_iterations,
        },
        "pending_blocks": ["gen1"],
        "component_values": {"gen1": {"netlist": netlist}},
        "netlists": {},
        "sim_results": sim_results,
        "iteration": iteration,
        "history": [],
        "verdict": None,
    }


def test_curador_rejects_a_generic_block_whose_repair_did_not_change_anything(monkeypatch):
    """repair_netlist ya reintenta una vez internamente (ver test_reparacion.py);
    si ni así avanzó, seguir ajustando gastaría el resto de las iteraciones
    repitiendo el mismo netlist roto en vez de decir por qué se rindió."""
    netlist_roto = "* roto\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"

    import agents.curador.node as curador_module

    monkeypatch.setattr(
        curador_module,
        "reparar_netlist_del_bloque",
        lambda block, values, requirements_fallidos, config: values["netlist"],
        raising=False,
    )

    result = curador_node(
        _generic_state(
            netlist_roto,
            {"gen1": {"metrics": None, "converged": False, "sim_error": "boom"}},
        )
    )

    assert result["verdict"]["status"] == "rejected"
    assert "gen1" in result["verdict"]["reason"]
    assert "no logró corregir" in result["verdict"]["reason"]
    # se rindió en la primera vuelta, no gastó las iteraciones que quedaban
    assert len(result["history"]) == 1


def test_curador_accepts_a_generic_block_whose_repair_changed_something(monkeypatch):
    netlist_roto = "* roto\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"
    netlist_corregido = "* corregido\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"

    import agents.curador.node as curador_module

    monkeypatch.setattr(
        curador_module,
        "reparar_netlist_del_bloque",
        lambda block, values, requirements_fallidos, config: netlist_corregido,
        raising=False,
    )

    result = curador_node(
        _generic_state(
            netlist_roto,
            {"gen1": {"metrics": None, "converged": False, "sim_error": "boom"}},
        )
    )

    assert "verdict" not in result
    assert result["component_values"]["gen1"]["netlist"] == netlist_corregido





@pytest.mark.parametrize("comparator,actual,value,tolerance,status,error", [
    ("le", 9, 10, 0.05, "ok", 0.0),
    ("le", 10, 10, 0.05, "ok", 0.0),
    ("le", 10.5, 10, 0.05, "ok", 0.05),
    ("le", 11, 10, 0.05, "off", 0.1),
    ("ge", 11, 10, 0.05, "ok", 0.0),
    ("ge", 10, 10, 0.05, "ok", 0.0),
    ("ge", 9.5, 10, 0.05, "ok", 0.05),
    ("ge", 9, 10, 0.05, "off", 0.1),
    ("le", -9, -10, 0.05, "off", 0.1),
    ("ge", -11, -10, 0.05, "off", 0.1),
    ("le", 1e-12, 0, 0.05, "off", 1.0),
    ("ge", -1e-12, 0, 0.05, "off", 1.0),
    ("approx", 0.01, 0, 0.05, "ok", 0.01),
    ("approx", 0.01, 1e-12, 0.05, "ok", 0.01 - 1e-12),
])
def test_policy_comparators(comparator, actual, value, tolerance, status, error):
    requirement = {"measure": "gain", "value": value, "comparator": comparator, "tolerance": tolerance}
    result = evaluate_requirement(requirement, {"metrics": {"gain": actual}, "sim_error": None})
    assert result == (status, pytest.approx(error))


def test_policy_missing_measurement_is_error():
    assert evaluate_requirement(REQUIREMENT, {"metrics": {}, "sim_error": None}) == ("error", None)


def test_admissibility_checks_each_requirement_tolerance():
    requirements = [("a", 0, 0.05), ("a", 1, 0.001)]
    evaluations = {("a", 0): ("ok", 0.01), ("a", 1): ("off", 0.02)}
    assert not accept_is_admissible(requirements, evaluations, POLICY_CFG)


@pytest.mark.parametrize("reverse", [False, True])
def test_curador_adjusts_catalog_once_using_worst_requirement(reverse):
    state = _state({"div1": {"metrics": {"v_out": 2.5, "gain": 1.0}, "converged": True, "sim_error": None}})
    requirements = state["normalized_spec"]["blocks"][0]["requirements"]
    requirements.append({"measure": "gain", "value": 4.0, "tolerance": 0.05})
    if reverse:
        requirements.reverse()
    result = curador_node(state)
    assert result["pending_blocks"] == ["div1"]
    assert result["component_values"]["div1"] == {"R1": 1000.0, "R2": 4000.0}
    assert result["history"][0]["weighted_ape"] == pytest.approx(100 * 0.8 / 3.3 + 75)
    assert result["history"][0]["reward"] == pytest.approx(10 - (100 * 0.8 / 3.3 + 75))


def test_curador_checks_all_requirements_even_when_reward_favors_accept():
    state = _state({"div1": {"metrics": {"v_out": 3.3, "gain": 0.98}, "converged": True, "sim_error": None}})
    state["normalized_spec"]["blocks"][0]["requirements"].append(
        {"measure": "gain", "value": 1.0, "tolerance": 0.001}
    )
    result = curador_node(state)
    assert result["history"][0]["decision"] == "adjust"
    assert result["component_values"]["div1"]["R2"] == pytest.approx(1000 / 0.98)


@pytest.mark.parametrize("sim_error", [None, "boom"])
def test_generic_repair_receives_only_failed_requirements_with_measurements(monkeypatch, sim_error):
    import agents.curador.node as module

    captured = []
    monkeypatch.setattr(module, "get_chat_model", lambda user_id: user_id)
    def repair(model, **kwargs):
        assert model == "user-1"
        captured.append(kwargs["requirements_fallidos"])
        return "fixed"
    monkeypatch.setattr(module, "repair_netlist", repair)
    state = _generic_state("broken", {"gen1": {
        "metrics": {"v_out": 1.0, "gain": 1.0, "current": 0.01} if sim_error is None else None,
        "converged": sim_error is None, "sim_error": sim_error,
    }})
    requirements = [
        {"measure": "v_out", "value": 5.0, "comparator": "approx", "tolerance": 0.05},
        {"measure": "gain", "value": 4.0, "comparator": "ge", "tolerance": 0.01},
        {"measure": "current", "value": 0.02, "comparator": "le", "tolerance": 0.01},
    ]
    state["normalized_spec"]["blocks"][0]["requirements"] = requirements
    result = curador_node(state, {"configurable": {"user_id": "user-1"}})
    expected = requirements if sim_error else requirements[:2]
    assert captured == [[{**req, "measured": None if sim_error else 1.0, "sim_error": sim_error} for req in expected]]
    assert result["pending_blocks"] == ["gen1"]
    assert result["component_values"] == {"gen1": {"netlist": "fixed"}}


def test_catalog_missing_measurement_perturbs_once():
    state = _state({"div1": {"metrics": {}, "converged": True, "sim_error": None}})
    result = curador_node(state)
    assert result["component_values"]["div1"] == {"R1": 1050.0, "R2": 1050.0}


@pytest.mark.parametrize("actual,iteration,decision", [(3.3, 0, "accept"), (3.1, 0, "accept"), (2.5, 0, "adjust"), (2.5, 4, "reject"), (0.01, 0, "accept")])
def test_single_requirement_exact_numeric_compatibility(actual, iteration, decision):
    from agents.config import get_config

    state = _state({"div1": _measured(actual)}, iteration=iteration)
    target = 0.0 if actual == 0.01 else 3.3
    state["normalized_spec"]["blocks"][0]["requirements"][0]["value"] = target
    state["normalized_spec"]["connections"] = []
    cfg = get_config()["curador"]
    old_error = abs(actual - target) / (abs(target) if abs(target) > 1e-12 else 1.0)
    old_ape = cfg["weights"].get("v_out", cfg["weights"]["default"]) * (old_error * 100.0)
    record = curador_node(state)["history"][0]
    assert record["decision"] == decision
    assert record["weighted_ape"] == old_ape
    assert record["reward"] == -old_ape + cfg["beta"] - cfg["gamma"] * iteration
