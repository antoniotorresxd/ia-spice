import os
import tempfile

from agents.escritura.netlist import build_voltage_divider_netlist
from agents.escritura.node import escritura_node


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
