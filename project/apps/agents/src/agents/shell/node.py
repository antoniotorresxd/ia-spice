from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    goals = {b["id"]: b["goal"] for b in state["normalized_spec"]["blocks"]}

    sim_results = {}
    for block_id in state["pending_blocks"]:
        netlist_path = state["netlists"][block_id]["path"]
        raw_output_path, error = run_ngspice(netlist_path)

        if error is not None:
            sim_results[block_id] = {"metrics": None, "sim_error": error}
            continue

        try:
            value = parse_wrdata_scalar(raw_output_path)
        except ValueError as exc:
            sim_results[block_id] = {"metrics": None, "sim_error": str(exc)}
            continue

        metric = goals[block_id]["metric"]
        sim_results[block_id] = {"metrics": {metric: value}, "sim_error": None}

    return {"sim_results": sim_results}
