from agents.shell.curve import extract_curve
from agents.shell.ngspice_runner import parse_measurements, parse_wrdata_scalar, run_ngspice
from agents.state import CircuitState


def _empty_curve() -> dict:
    return {"curve": [], "analysis_type": None, "x_unit": None, "y_unit": None, "x_label": None}


def _composed_shell(state: CircuitState) -> dict:
    """Un netlist compartido por todos los bloques pendientes: se corre
    ngspice una sola vez y sus mediciones (una por requisito, etiquetadas
    por bloque) se reparten entre los `sim_results` de cada bloque."""
    pending = state["pending_blocks"]
    if not pending:
        return {"sim_results": {}}

    netlist_path = state["netlists"][pending[0]]["path"]
    raw_output_path, error = run_ngspice(netlist_path)
    if error is not None:
        return {
            "sim_results": {
                bid: {"metrics": None, "converged": False, "sim_error": error} for bid in pending
            }
        }

    try:
        measurements = parse_measurements(raw_output_path)
    except ValueError as exc:
        return {
            "sim_results": {
                bid: {"metrics": None, "converged": False, "sim_error": str(exc)} for bid in pending
            }
        }

    curve = extract_curve(netlist_path) or _empty_curve()

    sim_results = {}
    for block_id in pending:
        block_metrics = measurements.get(block_id)
        if not block_metrics:
            sim_results[block_id] = {
                "metrics": None,
                "converged": False,
                "sim_error": f"no measurements found for block {block_id} in output.txt",
            }
            continue
        sim_results[block_id] = {
            "metrics": block_metrics,
            "converged": True,
            "sim_error": None,
            **curve,
        }
    return {"sim_results": sim_results}


def shell_node(state: CircuitState) -> dict:
    if state["normalized_spec"].get("connections"):
        return _composed_shell(state)

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
        target = goals[block_id].get("target")

        # La curva es solo para visualizar: corre aparte y, si falla, el
        # bloque queda sin curva pero con su medición intacta.
        curve = extract_curve(netlist_path) or {
            "curve": [],
            "analysis_type": None,
            "x_unit": None,
            "y_unit": None,
            "x_label": None,
        }

        sim_results[block_id] = {
            "metrics": {metric: value},
            "converged": True,
            "sim_error": None,
            **curve,
            "metric_name": metric,
            "measured_value": value,
            "target_value": target,
        }

    return {"sim_results": sim_results}
