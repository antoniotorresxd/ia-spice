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


def test_shell_node_sets_metrics_for_valid_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    netlist_path = _write_netlist(tmp_dir, VOLTAGE_DIVIDER_NETLIST)
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": netlist_path,
        "netlist_text": VOLTAGE_DIVIDER_NETLIST,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = shell_node(state)

    assert result["sim_error"] is None
    assert result["metrics"]["v_out"] == pytest.approx(3.3333333, rel=1e-5)
    assert os.path.exists(result["raw_output_path"])


def test_shell_node_sets_sim_error_for_broken_netlist():
    tmp_dir = tempfile.mkdtemp(prefix="agents-shell-node-test-")
    netlist_path = _write_netlist(tmp_dir, BROKEN_NETLIST)
    state = {
        "circuit_spec": {"v_in": 5.0, "r1": 1000, "r2": 2000},
        "netlist_path": netlist_path,
        "netlist_text": BROKEN_NETLIST,
        "raw_output_path": None,
        "metrics": None,
        "sim_error": None,
    }

    result = shell_node(state)

    assert result["metrics"] is None
    assert result["sim_error"] is not None
