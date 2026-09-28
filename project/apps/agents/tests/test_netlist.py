import os
import tempfile

import pytest

from agents.calculo.catalog_solver import solve_catalog_circuit
from agents.escritura.netlist import (
    NETLIST_BUILDERS,
    build_catalog_netlist,
    generate_writer_netlist,
)
from agents.escritura.node import escritura_node
from agents.knowledge.circuit_client import fetch_circuit_detail
from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice


def test_netlist_builders_registry_covers_all_types():
    assert set(NETLIST_BUILDERS.keys()) == {
        "catalog",
        "generic",
    }


def _pipeline_state():
    return {
        "circuit_spec": {},
        "request_text": None,
        "normalized_spec": {
            "blocks": [
                {
                    "id": "zener1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "zener_regulated_power_supply",
                        "params": {"v_z": 9.0},
                    },
                    "goal": {"metric": "vout", "target": 9.0, "tolerance": 0.05},
                },
                {
                    "id": "rc1",
                    "type": "catalog",
                    "params": {
                        "circuit_id": "rc_lowpass_passive",
                        "params": {"f_c": 1000.0},
                    },
                    "goal": {"metric": "fc", "target": 1000.0, "tolerance": 0.05},
                },
            ],
            "max_iterations": 5,
        },
        "pending_blocks": ["zener1", "rc1"],
        "component_values": {
            "zener1": {"Vin_min": 14.07, "RZ": 92.18, "RL": 180.0, "VZ": 9.0},
            "rc1": {"R": 1000.0, "C": 1.59155e-7},
        },
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def test_escritura_node_writes_one_netlist_per_pending_block():
    result = escritura_node(_pipeline_state())

    assert set(result["netlists"].keys()) == {"zener1", "rc1"}
    for entry in result["netlists"].values():
        assert os.path.exists(entry["path"])
        with open(entry["path"]) as f:
            assert f.read() == entry["text"]


def test_escritura_node_only_writes_pending_blocks():
    state = _pipeline_state()
    state["pending_blocks"] = ["rc1"]

    result = escritura_node(state)

    assert set(result["netlists"].keys()) == {"rc1"}


def test_catalog_netlist_zener_supply_simulates_cleanly():
    """Verifica que el netlist del catálogo para la fuente Zener se sintetice
    con título en la primera línea y que ngspice lo simule midiendo ~9.0 V."""
    params = {"circuit_id": "zener_regulated_power_supply"}
    values = {"Vin_min": 14.07, "RZ": 92.18, "RL": 180.0, "VZ": 9.0}
    text = NETLIST_BUILDERS["catalog"](params, values)

    assert text.startswith("*")
    assert "{" not in text and "}" not in text

    work_dir = tempfile.mkdtemp(prefix="agents-test-zener-")
    path = os.path.join(work_dir, "circuit.cir")
    with open(path, "w") as fh:
        fh.write(text)

    output_path, error = run_ngspice(path)
    assert error is None
    measured = parse_wrdata_scalar(output_path)
    assert measured == pytest.approx(9.0, abs=0.1)


def test_catalog_netlist_bjt_ce_amp_simulates_cleanly():
    """Verifica que el netlist del catálogo para el amplificador BJT se sintetice
    sin placeholders sin resolver y que ngspice lo simule sin error fatal."""
    circuit_id = "bjt_common_emitter_amp"
    params = {
        "circuit_id": circuit_id,
        "params": {
            "v_cc": 12.0,
            "i_cq": 0.002,
            "v_ceq": 6.0,
            "beta": 100,
            "r_l": 10000,
            "f_low": 20,
        },
    }
    values = solve_catalog_circuit(circuit_id, params["params"])
    text = NETLIST_BUILDERS["catalog"](params, values)

    assert text.startswith("*")
    assert "{" not in text and "}" not in text

    work_dir = tempfile.mkdtemp(prefix="agents-test-bjt-ce-")
    path = os.path.join(work_dir, "circuit.cir")
    with open(path, "w") as fh:
        fh.write(text)

    output_path, error = run_ngspice(path)
    assert error is None
    measured = parse_wrdata_scalar(output_path)
    assert abs(measured) > 1.0


def test_generate_writer_netlist_calls_chat_model():
    """Prueba que generate_writer_netlist invoque el modelo estructurado."""
    from unittest.mock import MagicMock

    circuit = fetch_circuit_detail("rc_lowpass_passive")
    mock_model = MagicMock()
    mock_structured = MagicMock()
    mock_structured.invoke.return_value = {
        "netlist": "* Custom Lowpass\nVin vin 0 DC 0 AC 1\nR1 vin vout 1k\nC1 vout 0 10n\n.control\nac dec 10 1 100k\nwrdata output.txt v(vout)\n.endc\n.end"
    }
    mock_model.with_structured_output.return_value = mock_structured

    netlist = generate_writer_netlist(
        mock_model,
        circuit=circuit,
        params={"f_c": 1000.0},
        goal={"metric": "fc", "target": 1000.0},
    )
    assert "* " in netlist
    assert ".control" in netlist
    assert "wrdata output.txt" in netlist


def test_generic_prose_title_line_is_commented_not_parsed_as_element(tmp_path):
    """Caso real: el LLM empezó el netlist con un título en prosa sin '*'.
    Anteponer otro título lo empujaba a la línea 2 y ngspice lo leía como
    elemento XSPICE `a...` ("unable to find definition of model dc")."""
    from agents.escritura.netlist import NETLIST_BUILDERS
    from agents.shell.ngspice_runner import parse_measurements, run_ngspice

    llm_netlist = (
        "amplificador no inversor con bias dc\n"
        "Vcc vcc 0 DC 5\n"
        "R1 vcc vbias 10k\n"
        "R2 vbias 0 10k\n"
        ".control\nop\necho b1 vbias $&v(vbias) > output.txt\nquit\n.endc\n.end\n"
    )
    netlist = NETLIST_BUILDERS["generic"]({"description": "x"}, {"netlist": llm_netlist})
    assert netlist.splitlines()[0] == "* amplificador no inversor con bias dc"
    path = tmp_path / "circuit.cir"
    path.write_text(netlist)
    output, error = run_ngspice(str(path))
    assert error is None, error
    assert parse_measurements(output)["b1"]["vbias"] == pytest.approx(2.5, rel=0.001)


def test_generic_netlist_starting_with_component_keeps_it():
    from agents.escritura.netlist import NETLIST_BUILDERS

    llm_netlist = "Vin in 0 DC 1\nR1 in out 1k\nR2 out 0 1k\n.control\nop\n.endc\n.end\n"
    netlist = NETLIST_BUILDERS["generic"]({"description": "Divisor"}, {"netlist": llm_netlist})
    assert netlist.splitlines()[:2] == ["* Divisor", "Vin in 0 DC 1"]


def test_generic_prose_title_after_leading_comment_is_commented():
    """Caso real: comentario en la línea 1 y título en prosa en la 2."""
    from agents.escritura.netlist import NETLIST_BUILDERS

    llm_netlist = (
        "* Amplificador no inversor, ganancia 8, bias 2.5V\n"
        "Amplificador No Inversor con Bias DC\n"
        "VCC vcc 0 DC 5\nR1 vcc vref 10k\nR2 vref 0 10k\n"
        ".control\nop\n.endc\n.end\n"
    )
    netlist = NETLIST_BUILDERS["generic"]({"description": "x"}, {"netlist": llm_netlist})
    assert netlist.splitlines()[:3] == [
        "* Amplificador no inversor, ganancia 8, bias 2.5V",
        "* Amplificador No Inversor con Bias DC",
        "VCC vcc 0 DC 5",
    ]
