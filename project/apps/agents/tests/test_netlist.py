import os
import tempfile

import pytest

from agents.escritura.netlist import build_voltage_divider_netlist
from agents.escritura.node import escritura_node
from agents.escritura.netlist import (
    NETLIST_BUILDERS,
    build_led_resistor_netlist,
    build_rc_lowpass_netlist,
)


def test_build_voltage_divider_netlist_contains_component_values():
    netlist = build_voltage_divider_netlist(v_in=5.0, r1=1000, r2=2000)

    assert "5.0" in netlist
    assert "1000" in netlist
    assert "2000" in netlist


def test_build_voltage_divider_netlist_requests_vout_control_block():
    netlist = build_voltage_divider_netlist(v_in=5.0, r1=1000, r2=2000)

    assert ".control" in netlist
    assert "wrdata" in netlist
    assert "v(vout)" in netlist
    assert ".endc" in netlist
    assert netlist.strip().endswith(".end")


def test_rc_lowpass_netlist_has_ac_analysis_and_meas():
    netlist = build_rc_lowpass_netlist(r=1000.0, c=1.59155e-7)

    assert "ac dec" in netlist
    assert "meas ac fc" in netlist.lower()
    assert "output.txt" in netlist
    assert netlist.strip().endswith(".end")


def test_led_resistor_netlist_has_diode_model_and_current_probe():
    netlist = build_led_resistor_netlist(v_in=5.0, r=150.0)

    assert ".model" in netlist.lower()
    assert "iled" in netlist.lower()
    assert "wrdata" in netlist
    assert netlist.strip().endswith(".end")


def test_netlist_builders_registry_covers_all_types():
    assert set(NETLIST_BUILDERS.keys()) == {
        "voltage_divider",
        "rc_lowpass",
        "led_resistor",
        "noninverting_amp",
    }
    netlist = NETLIST_BUILDERS["voltage_divider"](
        {"v_in": 5.0, "v_out": 3.3}, {"r1": 1000.0, "r2": 1941.18}
    )
    assert "1941.18" in netlist


def _pipeline_state():
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
                {
                    "id": "led1",
                    "type": "led_resistor",
                    "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02},
                    "goal": {"metric": "i_led", "target": 0.02, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["div1", "led1"],
        "component_values": {
            "div1": {"r1": 1000.0, "r2": 1941.18},
            "led1": {"r": 150.0},
        },
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def test_escritura_node_writes_one_netlist_per_pending_block():
    result = escritura_node(_pipeline_state())

    assert set(result["netlists"].keys()) == {"div1", "led1"}
    for entry in result["netlists"].values():
        assert os.path.exists(entry["path"])
        with open(entry["path"]) as f:
            assert f.read() == entry["text"]


def test_escritura_node_only_writes_pending_blocks():
    state = _pipeline_state()
    state["pending_blocks"] = ["led1"]

    result = escritura_node(state)

    assert set(result["netlists"].keys()) == {"led1"}


def test_noninverting_amp_netlist_simulates_to_the_expected_gain():
    """Contra ngspice de verdad: ganancia 3 sobre 1 V debe medir ~3 V.
    El desvío que quede es la ganancia finita en lazo abierto del macromodelo,
    no ruido numérico."""
    import os
    import tempfile

    from agents.escritura.netlist import NETLIST_BUILDERS
    from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

    text = NETLIST_BUILDERS["noninverting_amp"](
        {"v_in": 1.0, "v_out": 3.0}, {"rg": 1000.0, "rf": 2000.0}
    )
    assert ".subckt opamp" in text
    assert "X1" in text

    work_dir = tempfile.mkdtemp(prefix="agents-test-amp-")
    path = os.path.join(work_dir, "circuit.cir")
    with open(path, "w") as fh:
        fh.write(text)

    output_path, error = run_ngspice(path)

    assert error is None
    assert parse_wrdata_scalar(output_path) == pytest.approx(3.0, rel=0.001)


def test_rc_netlist_measures_the_true_minus_three_db_point():
    """El corte se define donde |H| = 1/sqrt(2) = -3.0103 dB, no -3.000.

    Medir en -3 exactos encontraba una frecuencia 0.24 % mas baja, con un
    sesgo sistematico identico en las cinco decadas del banco de evaluacion.
    Era un error del instrumento, no del circuito."""
    import math
    import os
    import tempfile

    from agents.escritura.netlist import NETLIST_BUILDERS
    from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

    f_c = 1000.0
    r = 1000.0
    c = 1.0 / (2 * math.pi * r * f_c)
    text = NETLIST_BUILDERS["rc_lowpass"]({"f_c": f_c}, {"r": r, "c": c})

    assert "-3.0103" in text, "volvio el sesgo de medir en -3 dB exactos"

    work_dir = tempfile.mkdtemp(prefix="agents-test-rc-")
    path = os.path.join(work_dir, "circuit.cir")
    with open(path, "w") as fh:
        fh.write(text)

    output_path, error = run_ngspice(path)

    assert error is None
    assert parse_wrdata_scalar(output_path) == pytest.approx(f_c, rel=0.001)
