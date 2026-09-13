from agents.llm.prompts import fetch_prompt
from agents.orquestador.schema import ChatOutcome, ClarifyOutcome, DesignOutcome, OrchestratorResult

class ExtractionError(Exception):
    """El LLM no produjo un resultado de orquestación válido."""


def extract_orchestrator_outcome(
    chat_model, request_text: str
) -> ChatOutcome | ClarifyOutcome | DesignOutcome:
    structured_model = chat_model.with_structured_output(OrchestratorResult)
    try:
        result = structured_model.invoke(
            [
                {"role": "system", "content": fetch_prompt("orquestador-system")},
                {"role": "user", "content": request_text},
            ]
        )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, OrchestratorResult):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result.outcome
