import os
import tempfile

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


def test_escritura_node_writes_netlist_file_and_state():
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": None,
        "netlist_text": None,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = escritura_node(state)

    assert result["netlist_text"] is not None
    assert "wrdata" in result["netlist_text"]
    assert os.path.exists(result["netlist_path"])
    with open(result["netlist_path"]) as f:
        assert f.read() == result["netlist_text"]


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
    }
    netlist = NETLIST_BUILDERS["voltage_divider"](
        {"v_in": 5.0, "v_out": 3.3}, {"r1": 1000.0, "r2": 1941.18}
    )
    assert "1941.18" in netlist
