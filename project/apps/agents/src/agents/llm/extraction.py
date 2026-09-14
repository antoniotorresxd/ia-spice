from agents.llm.prompts import fetch_prompt
from agents.orquestador.schema import ChatOutcome, ClarifyOutcome, DesignOutcome, OrchestratorResult


class ExtractionError(Exception):
    """El LLM no produjo un resultado de orquestación válido."""


def extract_orchestrator_outcome(
    chat_model, request_text: str, circuit_context: str | None = None
) -> ChatOutcome | ClarifyOutcome | DesignOutcome:
    structured_model = chat_model.with_structured_output(OrchestratorResult)

    if circuit_context is None:
        try:
            from agents.knowledge.circuit_client import (
                build_circuits_knowledge_context,
                fetch_circuit_catalog,
            )

            circuit_context = build_circuits_knowledge_context(fetch_circuit_catalog())
        except Exception:
            circuit_context = None

    system_prompt = fetch_prompt(
        "orquestador-system",
        retrieved_circuits_catalog=circuit_context or "(catálogo no disponible)",
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request_text},
    ]
    try:
        result = structured_model.invoke(messages)
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        if "structured outputs not support" in str(exc).lower() or "json_schema" in str(exc).lower():
            try:
                fallback_model = chat_model.with_structured_output(
                    OrchestratorResult, method="function_calling"
                )
                result = fallback_model.invoke(messages)
            except Exception as fallback_exc:
                raise ExtractionError(f"LLM extraction failed: {fallback_exc}") from fallback_exc
        else:
            raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
