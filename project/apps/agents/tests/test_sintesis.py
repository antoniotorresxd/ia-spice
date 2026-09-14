import pytest

from agents.sintesis.graph import build_sintesis_graph


def test_sintesis_generates_and_simulates_mixed_blocks():
    graph = build_sintesis_graph()
    state = {
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
                        "metric": "v_out",
                        "target": 3.3,
                    },
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
                {
                    "id": "rc1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "rc_lowpass_passive",
                        "params": {"f_c": 1000.0},
                        "metric": "fc",
                        "target": 1000.0,
                    },
                    "goal": {"metric": "fc", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "rc1"],
        "component_values": {
            "div1": {"R1": 1000.0, "R2": 1941.1764705882354},
            "rc1": {"R": 1000.0, "C": 1.5915494309189535e-07},
        },
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final_state = graph.invoke(state)

    div = final_state["sim_results"]["div1"]
    assert div["sim_error"] is None
    assert div["converged"] is True
    assert div["metrics"]["v_out"] == pytest.approx(3.3, rel=1e-3)

    rc = final_state["sim_results"]["rc1"]
    assert rc["sim_error"] is None
    assert rc["metrics"]["fc"] == pytest.approx(1000.0, rel=0.02)


def test_sim_results_report_convergence():
    from agents.shell.node import shell_node

    state = {
        "normalized_spec": {
            "blocks": [
                {
                    "id": "div1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 3.3},
                        "metric": "v_out",
                        "target": 3.3,
                    },
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
        },
        "pending_blocks": ["div1"],
        "netlists": {"div1": {"path": "/ruta/que/no/existe.cir", "text": ""}},
    }

    result = shell_node(state)

    assert result["sim_results"]["div1"]["sim_error"] is not None
    assert result["sim_results"]["div1"]["converged"] is False
