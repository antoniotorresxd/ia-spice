import pytest

from agents.sintesis.graph import build_sintesis_graph


def test_sintesis_generates_and_simulates_mixed_blocks():
    graph = build_sintesis_graph()
    state = {
        "circuit_spec": {},
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
        "component_values": {
            "div1": {"r1": 1000.0, "r2": 1941.1764705882354},
            "rc1": {"r": 1000.0, "c": 1.5915494309189535e-07},
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
    assert div["metrics"]["v_out"] == pytest.approx(3.3, rel=1e-3)

    rc = final_state["sim_results"]["rc1"]
    assert rc["sim_error"] is None
    # el punto -3 dB medido difiere ~0.3% del f_c analítico de primer orden
    assert rc["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.02)
