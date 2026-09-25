import os

from agents.shell.ngspice_runner import (
    inject_curve_export,
    parse_wrdata_curve,
    parse_wrdata_scalar,
    run_ngspice,
)
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
        target = goals[block_id].get("target")

        # Parsear curva de simulación si fue generada
        curve_path = os.path.join(os.path.dirname(netlist_path), "curve.txt")
        curve_points = parse_wrdata_curve(curve_path)

        netlist_text = state["netlists"][block_id].get("text", "")
        _, analysis_type, x_unit, y_unit = inject_curve_export(netlist_text)

        sim_results[block_id] = {
            "metrics": {metric: value},
            "converged": True,
            "sim_error": None,
            "curve": curve_points,
            "analysis_type": analysis_type,
            "x_unit": x_unit,
            "y_unit": y_unit,
            "metric_name": metric,
            "measured_value": value,
            "target_value": target,
        }

    return {"sim_results": sim_results}
