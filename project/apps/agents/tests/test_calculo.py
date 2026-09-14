import pytest

from agents.calculo.formulas import FORMULAS
from agents.calculo.graph import build_calculo_graph


def test_catalog_formula_resolves_zener():
    values = FORMULAS["catalog"](
        {
            "circuit_id": "zener_regulated_power_supply",
            "params": {"v_z": 9.0, "i_l_max": 0.05, "v_sec_rms": 12.0},
        }
    )

    assert values["RZ"] == 92.18
    assert values["RL"] == 180.0
    assert values["VZ"] == 9.0
    assert values["Vin_min"] == 14.07


def test_catalog_formula_resolves_rc_lowpass():
    values = FORMULAS["catalog"](
        {
            "circuit_id": "rc_lowpass_passive",
            "params": {"f_c": 1000.0, "c": 1e-8},
        }
    )
    assert "R" in values
    assert values["C"] == 1e-8


def test_catalog_formula_resolves_bjt_ce_amp():
    values = FORMULAS["catalog"](
        {
            "circuit_id": "bjt_common_emitter_amp",
            "params": {
                "v_cc": 12.0,
                "i_cq": 0.002,
                "v_ceq": 6.0,
                "beta": 100.0,
                "r_l": 10000.0,
                "f_low": 20.0,
            },
        }
    )
    assert "RE" in values
    assert "RC" in values
    assert "RB1" in values
    assert "RB2" in values
    assert "CE" in values


def test_calculo_subgraph_fans_out_one_worker_per_block():
    graph = build_calculo_graph()
    state = {
        "circuit_spec": {},
        "request_text": None,
        "normalized_spec": {
            "blocks": [
                {
                    "id": "zener1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "zener_regulated_power_supply",
                        "params": {"v_z": 9.0, "i_l_max": 0.05, "v_sec_rms": 12.0},
                    },
                    "goal": {"metric": "vout", "target": 9.0, "tolerance": 0.05},
                },
                {
                    "id": "rc1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "rc_lowpass_passive",
                        "params": {"f_c": 1000.0, "c": 1e-8},
                    },
                    "goal": {"metric": "fc", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["zener1", "rc1"],
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final_state = graph.invoke(state)

    values = final_state["component_values"]
    assert set(values.keys()) == {"zener1", "rc1"}
    assert "RZ" in values["zener1"]
    assert "R" in values["rc1"]


def test_generic_deja_pasar_el_netlist_sin_calcular_nada():
    netlist = "* x\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"

    values = FORMULAS["generic"](
        {"description": "algo", "metric": "v_out", "target": 1.0, "netlist": netlist}
    )

    assert values == {"netlist": netlist}
