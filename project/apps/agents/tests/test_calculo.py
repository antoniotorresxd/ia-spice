import math

import pytest

from agents.calculo.formulas import FORMULAS


def test_voltage_divider_values_satisfy_ratio():
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 3.3})

    r1, r2 = values["r1"], values["r2"]
    assert 5.0 * r2 / (r1 + r2) == pytest.approx(3.3, rel=1e-9)


def test_voltage_divider_unreachable_target_clamps_r2():
    # v_out >= v_in no tiene solución física; el worker no debe producir
    # resistencias negativas — el curador rechazará tras agotar iteraciones
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 6.0})
    assert values["r2"] == 1.0


def test_rc_lowpass_values_hit_cutoff():
    values = FORMULAS["rc_lowpass"]({"f_c": 1000.0})

    f_c = 1.0 / (2 * math.pi * values["r"] * values["c"])
    assert f_c == pytest.approx(1000.0, rel=1e-9)


def test_led_resistor_values_ohms_law():
    values = FORMULAS["led_resistor"]({"v_in": 5.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == pytest.approx((5.0 - 2.0) / 0.02, rel=1e-9)


def test_led_resistor_clamps_minimum_resistance():
    values = FORMULAS["led_resistor"]({"v_in": 2.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == 1.0


from agents.calculo.graph import build_calculo_graph


def test_calculo_subgraph_fans_out_one_worker_per_block():
    graph = build_calculo_graph()
    state = {
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
                {
                    "id": "rc1",
                    "type": "rc_lowpass",
                    "params": {"f_c": 1000.0},
                    "goal": {"metric": "f_c", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "rc1"],
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final_state = graph.invoke(state)

    values = final_state["component_values"]
    assert set(values.keys()) == {"div1", "rc1"}
    assert values["div1"]["r1"] == 1000.0
    assert "c" in values["rc1"]


import yaml

from agents.config import reset_config_cache


@pytest.fixture(autouse=True)
def _clean_config_cache():
    reset_config_cache()
    yield
    reset_config_cache()


def test_formulas_read_their_defaults_from_the_config(tmp_path, monkeypatch):
    custom = tmp_path / "otra.yaml"
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
                    "max_iterations": 5,
                    "tolerance": 0.05,
                },
                "calculo": {
                    "r1_default": 4700.0,
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

    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 2.5})

    assert values["r1"] == 4700.0


def test_noninverting_amp_solves_the_feedback_ratio():
    # Av = 3 con Rg = 1k  ->  Rf = Rg·(Av-1) = 2k
    values = FORMULAS["noninverting_amp"]({"v_in": 1.0, "v_out": 3.0})

    assert values["rg"] == 1000.0
    assert values["rf"] == pytest.approx(2000.0)


def test_noninverting_amp_with_unreachable_gain_emits_a_valid_circuit():
    """Un no inversor no atenúa. La meta es inalcanzable, pero se emite un
    circuito válido y el curador la rechaza al agotar iteraciones."""
    values = FORMULAS["noninverting_amp"]({"v_in": 5.0, "v_out": 2.0})

    assert values["rf"] > 0
    assert values["rg"] > 0


def test_generic_deja_pasar_el_netlist_sin_calcular_nada():
    netlist = "* x\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"

    values = FORMULAS["generic"](
        {"description": "algo", "metric": "v_out", "target": 1.0, "netlist": netlist}
    )

    assert values == {"netlist": netlist}
