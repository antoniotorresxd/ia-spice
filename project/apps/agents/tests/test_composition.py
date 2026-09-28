"""Slice B: deterministic measurements and the real catalog cascade."""
import pytest

from agents.calculo.catalog_solver import solve_catalog_circuit
from agents.curador.policy import metric_key
from agents.escritura.netlist import build_catalog_netlist
from agents.shell.ngspice_runner import run_ngspice


def req(measure, value=1, node="", **kwargs):
    return dict(measure=measure, value=value, node=node, comparator="approx", tolerance=0.05, **kwargs)


def cascade():
    blocks = [
        dict(id="hp", type="catalog", params=dict(circuit_id="opamp_highpass_active", params={"f_c": 1000, "gain": 2}),
             requirements=[req("fc_-3db", 1000)]),
        dict(id="amp", type="catalog", params=dict(circuit_id="opamp_noninverting_amp", params={"v_in": 1, "v_out": 4}),
             requirements=[req("gain_at_freq", 4, frequency_hz=10000)]),
    ]
    return {"normalized_spec": {"blocks": blocks, "connections": [("hp.vout", "amp.vin")]},
            "component_values": {b["id"]: solve_catalog_circuit(b["params"]["circuit_id"], b["params"]["params"]) for b in blocks},
            "pending_blocks": ["hp", "amp"], "iteration": 0}


def test_measure_vocabulary_rejects_unknown_measure():
    """El vocabulario cerrado de B1 solo aplica a requisitos de composición
    (con `node`), traducidos vía `measurement_commands`. Un Requirement sin
    `node` sigue aceptando cualquier nombre de métrica libre, tal como lo deja
    Slice A: son nombres heredados de cada plantilla del catálogo (`v_out`,
    `fc`, `vceq`, ...), no tipos de medida. Restringir `measure` a nivel de
    schema rompería esa compatibilidad, ya verificada byte a byte en Slice A.
    """
    from agents.escritura.measurements import measurement_commands

    with pytest.raises(ValueError, match="measure"):
        measurement_commands(req("whatever_the_llm_invents"), node="vout")


@pytest.mark.parametrize("measure,expected", [
    ("max", 3), ("min", -1), ("peak_to_peak", 4), ("ripple", 4),
    ("dc", 1), ("current", -0.001), ("gain_at_freq", 1),
])
def test_measures_run_in_real_ngspice(tmp_path, measure, expected):
    from agents.escritura.measurements import measurement_commands
    from agents.shell.ngspice_runner import parse_measurements

    requirement = req(measure, node="Vin" if measure == "current" else "vout")
    commands = measurement_commands(requirement, node="Vin" if measure == "current" else "vout", input_node="vout")
    key = metric_key(requirement)
    text = "* measures\nVin vout 0 DC 1 AC 1 SIN(1 2 1000)\nR1 vout 0 1k\nV__measure __measure 0 0\n.control\n"
    text += "\n".join(commands) + f"\necho b {key} $&{key} > output.txt\nquit\n.endc\n.end\n"
    path = tmp_path / "circuit.cir"
    path.write_text(text)
    output, error = run_ngspice(str(path))
    assert error is None, error
    assert parse_measurements(output)["b"][key] == pytest.approx(expected, rel=0.005)


def test_subcircuit_transform_renames_nested_definitions():
    from agents.escritura.composition import template_to_subcircuit

    state = cascade()
    parts = []
    for block in state["normalized_spec"]["blocks"]:
        text = build_catalog_netlist(block["params"], state["component_values"][block["id"]])
        part = template_to_subcircuit(text, block["id"])
        parts.append(part.text.lower())
        assert f'.subckt {block["id"]} vin vout 0' in part.text.lower()
        assert '.control' not in part.text.lower()
        assert '\nvin ' not in part.text.lower()
        assert f'.subckt {block["id"]}_opamp ' in part.text.lower()
        assert f'e{block["id"]}_gain' in part.text.lower()
        assert f'{block["id"]}_n1' in part.text.lower()
    assert '.subckt opamp ' not in '\n'.join(parts)


def test_cascade_is_one_design_and_measures_each_stage():
    from agents.escritura.node import escritura_node
    from agents.shell.node import shell_node

    state = cascade()
    state.update(escritura_node(state))
    entries = state["netlists"]
    assert len({entry["path"] for entry in entries.values()}) == 1
    text = next(iter(entries.values()))["text"].lower()
    assert text.count('.control') == 1
    assert 'xamp hp_vout amp_vout 0 amp' in text
    assert 'vhp_in hp_vin 0 dc 0 ac 1' in text
    assert 'vamp_in' not in text
    results = shell_node(state)["sim_results"]
    assert results["hp"]["sim_error"] is None, results
    assert results["amp"]["sim_error"] is None, results
    assert results["hp"]["metrics"]["fc_-3db"] == pytest.approx(1000, rel=0.04)
    assert results["amp"]["metrics"]["gain_at_freq"] == pytest.approx(4, rel=0.01)


def test_catalog_never_resolves_writer_llm(monkeypatch):
    from agents.escritura import node

    def forbidden(*args, **kwargs):
        pytest.fail("catalog synthesis must not resolve the writer LLM")
    monkeypatch.setattr(node, "get_chat_model", forbidden)
    node.escritura_node(cascade(), {"configurable": {"user_id": "u"}})
