import os
import tempfile

import pytest

from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

VOLTAGE_DIVIDER_NETLIST = """.title Voltage Divider
Vinput vin 0 5.0
R1 vin vout 1000
R2 vout 0 2000
.control
op
wrdata output.txt v(vout)
.endc
.end
"""

BROKEN_NETLIST = """.title Broken
Rbad a b notanumber
.control
op
.endc
.end
"""


def _write_netlist(tmp_path, text, filename="circuit.cir"):
    path = os.path.join(tmp_path, filename)
    with open(path, "w") as f:
        f.write(text)
    return path


def test_run_ngspice_produces_output_file_for_valid_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    raw_output_path, error = run_ngspice(netlist_path)

    assert error is None
    assert raw_output_path is not None
    assert os.path.exists(raw_output_path)


def test_run_ngspice_returns_error_for_broken_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, BROKEN_NETLIST)

    raw_output_path, error = run_ngspice(netlist_path)

    assert raw_output_path is None
    assert error is not None


def test_parse_wrdata_scalar_reads_last_column():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)
    raw_output_path, error = run_ngspice(netlist_path)
    assert error is None

    value = parse_wrdata_scalar(raw_output_path)

    assert value == pytest.approx(5.0 * 2000 / (1000 + 2000), rel=1e-6)


def test_parse_wrdata_scalar_raises_on_empty_file():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-test-")
    empty_path = os.path.join(tmp_dir, "empty.txt")
    with open(empty_path, "w"):
        pass

    with pytest.raises(ValueError):
        parse_wrdata_scalar(empty_path)


from agents.shell.node import shell_node


def _pipeline_state(netlists, pending):
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
                    "id": "bad1",
                    "type": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "goal": {"metric": "v_out", "target": 3.3, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": pending,
        "component_values": {},
        "netlists": netlists,
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def test_shell_node_simulates_each_pending_block():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    state = _pipeline_state(
        netlists={"div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST}},
        pending=["div1"],
    )
    result = shell_node(state)

    div = result["sim_results"]["div1"]
    assert div["sim_error"] is None
    assert div["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)


def test_shell_node_isolates_errors_per_block():
    good_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    bad_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(good_dir, VOLTAGE_DIVIDER_NETLIST)
    bad = _write_netlist(bad_dir, BROKEN_NETLIST)

    state = _pipeline_state(
        netlists={
            "div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST},
            "bad1": {"path": bad, "text": BROKEN_NETLIST},
        },
        pending=["div1", "bad1"],
    )
    result = shell_node(state)

    assert result["sim_results"]["div1"]["sim_error"] is None
    assert result["sim_results"]["bad1"]["sim_error"] is not None
    assert result["sim_results"]["bad1"]["metrics"] is None


def test_shell_node_skips_non_pending_blocks():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    good = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)

    state = _pipeline_state(
        netlists={"div1": {"path": good, "text": VOLTAGE_DIVIDER_NETLIST}},
        pending=[],
    )
    result = shell_node(state)

    assert result["sim_results"] == {}
