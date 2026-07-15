# project/apps/agents/tests/test_graph.py
import pytest

from agents.graph import build_graph


def _initial_state(circuit_spec):
    return {
        "circuit_spec": circuit_spec,
        "request_text": None,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def _run(circuit_spec, thread_id):
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    return graph.invoke(_initial_state(circuit_spec), config)


def test_voltage_divider_converges_first_iteration():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ]
    }

    final = _run(spec, "e2e-divider")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) == 1
    v_out = final["sim_results"]["div1"]["metrics"]["v_out"]
    assert v_out == pytest.approx(3.3, rel=0.05)


def test_led_requires_adjustment_then_converges():
    # el modelo de diodo tiene Vf ~2.18 V a 20 mA, distinto del v_f=2.0 del
    # spec, así que la primera iteración queda ~6% fuera con tolerancia 1%
    # y el curador debe ajustar al menos una vez antes de converger
    spec = {
        "blocks": [
            {"id": "led1", "type": "led_resistor", "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02}}
        ],
        "tolerance": 0.01,
    }

    final = _run(spec, "e2e-led-adjust")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) >= 2
    assert final["history"][0]["decision"] == "adjust"
    i_led = final["sim_results"]["led1"]["metrics"]["i_led"]
    assert i_led == pytest.approx(0.02, rel=0.01)


def test_impossible_spec_rejected_at_max_iterations():
    # v_out > v_in: inalcanzable; el ajuste empuja r2 hacia arriba pero
    # v_out nunca supera v_in
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 6.0}}
        ],
        "max_iterations": 3,
    }

    final = _run(spec, "e2e-impossible")

    assert final["verdict"]["status"] == "rejected"
    assert len(final["history"]) == 3
    assert final["verdict"]["best_iteration"] is not None


def test_mixed_blocks_evaluated_globally():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
            {"id": "rc1", "type": "rc_lowpass", "params": {"f_c": 1000.0}},
        ]
    }

    final = _run(spec, "e2e-mixed")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(3.3, rel=0.05)
    assert final["sim_results"]["rc1"]["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.05)


def test_invalid_spec_rejected_without_simulation():
    final = _run({"blocks": []}, "e2e-invalid")

    assert final["verdict"]["status"] == "rejected"
    assert final["normalized_spec"] is None
    assert final["sim_results"] == {}


def test_graph_checkpoints_state_by_thread_id():
    graph = build_graph()
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 9.0, "v_out": 6.0}}
        ]
    }
    config = {"configurable": {"thread_id": "e2e-checkpoint"}}

    graph.invoke(_initial_state(spec), config)
    snapshot = graph.get_state(config)

    assert snapshot.values["verdict"]["status"] == "accepted"
    assert snapshot.values["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(
        6.0, rel=0.05
    )
