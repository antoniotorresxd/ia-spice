from agents.config import get_config
from agents.curador.policy import (
    ADJUST_RULES,
    accept_is_admissible,
    choose_action,
    estimate_action_rewards,
    evaluate_block,
    observed_reduction,
    perturb,
)
from agents.curador.reward import build_measurements, weighted_ape
from agents.state import CircuitState

ACCEPTED_BY_TOLERANCE = "all blocks within tolerance"
ACCEPTED_BY_REWARD = (
    "aceptado por recompensa: otra iteración costaría más de lo que reduciría el error"
)


def curador_node(state: CircuitState) -> dict:
    cfg = get_config()
    spec = state["normalized_spec"]
    iteration = state["iteration"]
    blocks = spec["blocks"]
    max_iterations = spec.get("max_iterations") or cfg["curador"]["max_iterations"]

    evaluations = {
        block["id"]: evaluate_block(block["goal"], state["sim_results"][block["id"]])
        for block in blocks
    }

    failing = {bid: status for bid, (status, _) in evaluations.items() if status != "ok"}
    rel_errs = [err for _, err in evaluations.values() if err is not None]
    worst_rel_err = max(rel_errs) if rel_errs else None

    # c de la fórmula: la corrida converge si convergieron todos sus bloques.
    # El .get es defensivo a propósito: hoy `shell_node` es el único productor
    # de sim_results y siempre pone la clave, pero si mañana otro camino la
    # omite, tratarlo como "no convergió" es la lectura segura — pierde el
    # premio β en lugar de tumbar la corrida.
    converged = all(
        state["sim_results"][block["id"]].get("converged", False) for block in blocks
    )

    measurements = build_measurements(blocks, evaluations, cfg)
    action_rewards = estimate_action_rewards(
        measurements,
        converged=converged,
        iteration=iteration,
        config=cfg,
        reduction=observed_reduction(state["history"]),
    )

    record = {
        "iteration": iteration,
        "component_values": dict(state["component_values"]),
        "sim_results": dict(state["sim_results"]),
        "evaluations": {bid: status for bid, (status, _) in evaluations.items()},
        "worst_rel_err": worst_rel_err,
        "weighted_ape": weighted_ape(measurements, cfg),
        "converged": converged,
        # R de ESTA iteración según la fórmula de la tesina, que es una
        # propiedad del estado y no de la acción tomada: coincide con la
        # recompensa de aceptar porque aceptar es quedarse con este estado.
        # OJO si algún día se entrena una política con este historial: para
        # armar tuplas (estado, acción, recompensa) hay que tomar la entrada
        # de `action_rewards` que corresponda a `decision`, no este campo.
        "reward": action_rewards["accept"],
        "action_rewards": action_rewards,
    }

    # Respaldo determinista: dentro de tolerancia se acepta sin consultar la
    # política. Es la garantía de fiabilidad que la tesina describe — el
    # sistema siempre produce una decisión aunque la política no aplique.
    if not failing:
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": ACCEPTED_BY_TOLERANCE,
                "best_iteration": iteration,
            },
        }

    # La recompensa decide cuándo parar de iterar; la tolerancia de cada
    # bloque decide si lo que hay se puede entregar. Separarlas evita que un
    # circuito estancado lejos de su meta se reporte como aceptado.
    action = choose_action(
        action_rewards,
        adjust_available=iteration + 1 < max_iterations,
        accept_admissible=accept_is_admissible(blocks, evaluations, cfg),
    )

    if action == "accept":
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": ACCEPTED_BY_REWARD,
                "best_iteration": iteration,
            },
        }

    if action == "reject":
        record["decision"] = "reject"
        sim_errors = [
            state["sim_results"][bid]["sim_error"]
            for bid, status in failing.items()
            if status == "error"
        ]
        reason = (
            f"simulation errors after {max_iterations} iterations: {sim_errors}"
            if sim_errors
            else f"goals not met after {max_iterations} iterations"
        )
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "rejected",
                "reason": reason,
                "best_iteration": _best_iteration(state["history"] + [record]),
            },
        }

    record["decision"] = "adjust"
    blocks_by_id = {b["id"]: b for b in blocks}
    adjusted = {}
    for bid, status in failing.items():
        block = blocks_by_id[bid]
        values = state["component_values"][bid]
        if status == "error":
            adjusted[bid] = perturb(values)
        else:
            actual = state["sim_results"][bid]["metrics"][block["goal"]["metric"]]
            adjusted[bid] = ADJUST_RULES[block["type"]](
                values, target=block["goal"]["target"], actual=actual
            )

    return {
        "history": [record],
        "component_values": adjusted,
        "pending_blocks": list(failing.keys()),
        "iteration": iteration + 1,
    }


def _best_iteration(history: list) -> int | None:
    """La mejor iteración es la de mayor recompensa.

    Antes se elegía por error relativo mínimo, que ignora la convergencia y el
    costo de las iteraciones; la recompensa las incorpora, que es justamente
    para lo que existe.
    """
    scored = [r for r in history if r.get("reward") is not None]
    if not scored:
        return None
    return max(scored, key=lambda r: r["reward"])["iteration"]


def route_after_curador(state: CircuitState) -> str:
    return "done" if state["verdict"] is not None else "adjust"
