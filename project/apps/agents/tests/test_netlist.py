from agents.escritura.netlist import build_voltage_divider_netlist


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
