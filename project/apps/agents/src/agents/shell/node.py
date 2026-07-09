from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    raw_output_path, error = run_ngspice(state["netlist_path"])

    if error is not None:
        return {"raw_output_path": None, "metrics": None, "sim_error": error}

    try:
        v_out = parse_wrdata_scalar(raw_output_path)
    except ValueError as exc:
        return {
            "raw_output_path": raw_output_path,
            "metrics": None,
            "sim_error": str(exc),
        }

    return {
        "raw_output_path": raw_output_path,
        "metrics": {"v_out": v_out},
        "sim_error": None,
    }
