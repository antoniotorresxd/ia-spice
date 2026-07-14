from agents.curador.policy import ADJUST_RULES, evaluate_block, perturb
from agents.state import CircuitState


def curador_node(state: CircuitState) -> dict:
    spec = state["normalized_spec"]
    iteration = state["iteration"]

    evaluations = {}
    for block in spec["blocks"]:
        evaluations[block["id"]] = evaluate_block(
            block["goal"], state["sim_results"][block["id"]]
        )

    failing = {bid: status for bid, (status, _) in evaluations.items() if status != "ok"}
    rel_errs = [err for _, err in evaluations.values() if err is not None]
    worst_rel_err = max(rel_errs) if rel_errs else None

    record = {
        "iteration": iteration,
        "component_values": dict(state["component_values"]),
        "sim_results": dict(state["sim_results"]),
        "evaluations": {bid: status for bid, (status, _) in evaluations.items()},
        "worst_rel_err": worst_rel_err,
    }

    if not failing:
        record["decision"] = "accept"
        return {
            "history": [record],
            "pending_blocks": [],
            "verdict": {
                "status": "accepted",
                "reason": "all blocks within tolerance",
                "best_iteration": iteration,
            },
        }

    if iteration + 1 >= spec["max_iterations"]:
        record["decision"] = "reject"
        sim_errors = [
            state["sim_results"][bid]["sim_error"]
            for bid, status in failing.items()
            if status == "error"
        ]
        reason = (
            f"simulation errors after {spec['max_iterations']} iterations: {sim_errors}"
            if sim_errors
            else f"goals not met after {spec['max_iterations']} iterations"
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
    blocks = {b["id"]: b for b in spec["blocks"]}
    adjusted = {}
    for bid, status in failing.items():
        block = blocks[bid]
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
    scored = [r for r in history if r.get("worst_rel_err") is not None]
    if not scored:
        return None
    return min(scored, key=lambda r: r["worst_rel_err"])["iteration"]


def route_after_curador(state: CircuitState) -> str:
    return "done" if state["verdict"] is not None else "adjust"
