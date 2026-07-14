from pydantic import ValidationError

from agents.orquestador.schema import CircuitSpec
from agents.state import CircuitState

# metric name y de qué parámetro sale el target, por tipo de circuito
_GOALS = {
    "voltage_divider": ("v_out", "v_out"),
    "rc_lowpass": ("f_c", "f_c"),
    "led_resistor": ("i_led", "i_led"),
}


def orquestador_node(state: CircuitState) -> dict:
    try:
        spec = CircuitSpec.model_validate(state["circuit_spec"])
    except ValidationError as exc:
        return {
            "verdict": {
                "status": "rejected",
                "reason": f"invalid circuit_spec: {exc}",
                "best_iteration": None,
            }
        }

    blocks = []
    for block in spec.blocks:
        params = block.params.model_dump()
        metric, target_param = _GOALS[block.type]
        blocks.append(
            {
                "id": block.id,
                "type": block.type,
                "params": params,
                "goal": {
                    "metric": metric,
                    "target": params[target_param],
                    "tolerance": spec.tolerance,
                },
            }
        )

    return {
        "normalized_spec": {"blocks": blocks, "max_iterations": spec.max_iterations},
        "pending_blocks": [b["id"] for b in blocks],
        "iteration": 0,
    }


def route_after_orquestador(state: CircuitState) -> str:
    return "reject" if state["verdict"] is not None else "continue"
