# project/apps/agents/tests/test_graph.py
import pytest

from agents.graph import build_graph


def test_graph_runs_escritura_then_shell_for_voltage_divider():
    graph = build_graph()
    initial_state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }
    config = {"configurable": {"thread_id": "test-voltage-divider"}}

    final_state = graph.invoke(initial_state, config)

    assert final_state["sim_error"] is None
    assert final_state["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)
    assert final_state["netlist_path"] is not None
    assert final_state["raw_output_path"] is not None


def test_graph_checkpoints_state_by_thread_id():
    graph = build_graph()
    initial_state = {
        "circuit_spec": {"v_in": 9.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }
    config = {"configurable": {"thread_id": "test-checkpoint"}}

    graph.invoke(initial_state, config)
    snapshot = graph.get_state(config)

    assert snapshot.values["metrics"]["v_out"] == pytest.approx(6.0, rel=1e-5)
