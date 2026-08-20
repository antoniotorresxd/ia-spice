from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def shell_node(state: CircuitState) -> dict:
    goals = {b["id"]: b["goal"] for b in state["normalized_spec"]["blocks"]}

    sim_results = {}
    for block_id in state["pending_blocks"]:
        netlist_path = state["netlists"][block_id]["path"]
        raw_output_path, error = run_ngspice(netlist_path)

        # `error` agrupa dos cosas distintas: un fallo del circuito —ngspice
        # sale con código distinto de cero, o no escribe la salida— y un fallo
        # del entorno —timeout, o ngspice ausente del PATH—. Se reportan igual
        # porque en ninguno hubo medición: converger equivale a haber podido
        # medir. Distinguirlos exigiría leer el log de ngspice y está fuera de
        # alcance; téngalo presente al leer la recompensa, donde un entorno
        # roto puntúa igual que un circuito que no converge.
        if error is not None:
            sim_results[block_id] = {
                "metrics": None,
                "converged": False,
                "sim_error": error,
            }
            continue

        try:
            value = parse_wrdata_scalar(raw_output_path)
        except ValueError as exc:
            sim_results[block_id] = {
                "metrics": None,
                "converged": False,
                "sim_error": str(exc),
            }
            continue

        metric = goals[block_id]["metric"]
        sim_results[block_id] = {
            "metrics": {metric: value},
            "converged": True,
            "sim_error": None,
        }

    return {"sim_results": sim_results}
