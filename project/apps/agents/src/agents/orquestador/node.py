from langchain_core.runnables import RunnableConfig
from pydantic import ValidationError

from agents.llm.extraction import ExtractionError, extract_circuit_spec
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.orquestador.schema import CircuitSpec
from agents.state import CircuitState

# metric name y de qué parámetro sale el target, por tipo de circuito
_GOALS = {
    "voltage_divider": ("v_out", "v_out"),
    "rc_lowpass": ("f_c", "f_c"),
    "led_resistor": ("i_led", "i_led"),
    "noninverting_amp": ("v_out", "v_out"),
}


# El agente al que corresponde este nodo, para pedir su configuración de LLM.
AGENT_ID = "orchestrator"


def get_chat_model(user_id: str):
    """Resuelve el LLM de este agente para el usuario de la corrida y construye
    el chat model.

    Punto de indirección a nivel de módulo: los tests lo sustituyen (monkeypatch)
    por un fake para no depender de red ni del server.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


def _rejected(reason: str) -> dict:
    return {
        "verdict": {"status": "rejected", "reason": reason, "best_iteration": None}
    }


def _normalize(spec: CircuitSpec) -> dict:
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


def orquestador_node(state: CircuitState, config: RunnableConfig | None = None) -> dict:
    request_text = state.get("request_text")
    circuit_spec = state.get("circuit_spec")

    if request_text:
        user_id = (config or {}).get("configurable", {}).get("user_id")
        if not user_id:
            return _rejected("missing user_id in run config")

        try:
            chat_model = get_chat_model(user_id)
        except LlmSettingsError as exc:
            return _rejected(f"llm_settings_unavailable: {exc}")

        try:
            spec = extract_circuit_spec(chat_model, request_text)
        except ExtractionError as exc:
            return _rejected(f"llm_extraction_failed: {exc}")

        result = _normalize(spec)
        # se sobreescribe circuit_spec con lo que el LLM entendió, para que
        # history/depuración muestren la especificación resuelta
        result["circuit_spec"] = spec.model_dump(mode="json")
        return result

    if circuit_spec:
        try:
            spec = CircuitSpec.model_validate(circuit_spec)
        except ValidationError as exc:
            return _rejected(f"invalid circuit_spec: {exc}")
        return _normalize(spec)

    return _rejected("no input provided: neither request_text nor circuit_spec")


def route_after_orquestador(state: CircuitState) -> str:
    return "reject" if state["verdict"] is not None else "continue"
