from langchain_core.runnables import RunnableConfig
from pydantic import ValidationError

from agents.llm.extraction import ExtractionError, extract_orchestrator_outcome
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.orquestador.schema import CircuitSpec
from agents.state import CircuitState

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


def _goal_for(block, params: dict, tolerance: float) -> dict:
    """La meta de un bloque (métrica y target numérico deseado)."""
    metric = params.get("metric", "vout")
    target = float(params.get("target", 0.0))

    # Si el target es un valor absurdamente grande o infinito (alucinación del LLM >= 1e6),
    # recuperamos el valor real de forma genérica a partir de los parámetros del bloque.
    if abs(target) >= 1e6:
        block_params = params.get("params", {})
        norm_metric = metric.lower().replace("_", "")
        # 1. Buscar si algún parámetro coincide con el nombre de la métrica
        for k, v in block_params.items():
            if k.lower().replace("_", "") == norm_metric and isinstance(v, (int, float)):
                target = float(v)
                break
        else:
            # 2. Buscar parámetros típicos de salida del catálogo (vout, vceq, fc, etc.)
            for out_key in ("vout", "vceq", "target", "fc", "vclip", "vz"):
                for k, v in block_params.items():
                    if k.lower().replace("_", "") == out_key and isinstance(v, (int, float)):
                        target = float(v)
                        metric = k
                        break

    return {
        "metric": metric,
        "target": target,
        "tolerance": tolerance,
    }


def _normalize(spec: CircuitSpec) -> dict:
    blocks = []
    for block in spec.blocks:
        params = block.params.model_dump()
        blocks.append(
            {
                "id": block.id,
                "type": block.type,
                "params": params,
                "goal": _goal_for(block, params, spec.tolerance),
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
            outcome = extract_orchestrator_outcome(chat_model, request_text)
        except ExtractionError as exc:
            return _rejected(f"llm_extraction_failed: {exc}")

        if outcome.mode == "chat":
            return {"outcome": {"mode": "chat", "reply": outcome.reply}}

        if outcome.mode == "clarify":
            return {
                "outcome": {
                    "mode": "clarify",
                    "question": outcome.question,
                    "partial_spec": outcome.partial_spec,
                }
            }

        spec = outcome.spec
        configurable = (config or {}).get("configurable", {})
        custom_max_iter = configurable.get("max_iterations")
        custom_tol = configurable.get("tolerance")
        updates = {}
        if custom_max_iter is not None:
            updates["max_iterations"] = custom_max_iter
        if custom_tol is not None:
            updates["tolerance"] = custom_tol
        if updates:
            spec = spec.model_copy(update=updates)

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
        configurable = (config or {}).get("configurable", {})
        custom_max_iter = configurable.get("max_iterations")
        custom_tol = configurable.get("tolerance")
        updates = {}
        if custom_max_iter is not None:
            updates["max_iterations"] = custom_max_iter
        if custom_tol is not None:
            updates["tolerance"] = custom_tol
        if updates:
            spec = spec.model_copy(update=updates)
        return _normalize(spec)

    return _rejected("no input provided: neither request_text nor circuit_spec")


def route_after_orquestador(state: CircuitState) -> str:
    if state["verdict"] is not None:
        return "reject"
    outcome = state.get("outcome")
    if outcome and outcome.get("mode") in ("chat", "clarify"):
        return "stop"
    return "continue"
