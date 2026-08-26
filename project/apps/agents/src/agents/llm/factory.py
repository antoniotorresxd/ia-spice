from langchain.chat_models import init_chat_model

from agents.config import get_config
from agents.llm.settings_client import AgentLlmConfig

_PROVIDER_MAP = {
    "anthropic": "anthropic",
    "openai": "openai",
    "google": "google_genai",
    "openai_compatible": "openai",
}


class UnsupportedProviderError(Exception):
    pass


def build_chat_model(config: AgentLlmConfig):
    if config.provider not in _PROVIDER_MAP:
        raise UnsupportedProviderError(f"unsupported provider: {config.provider}")

    kwargs: dict = {
        "model": config.model,
        "model_provider": _PROVIDER_MAP[config.provider],
        # Fija la temperatura para que la evaluación experimental sea
        # repetible: es un criterio de aceptación de la tesina, no una
        # preferencia de estilo.
        "temperature": get_config()["llm"]["temperature"],
    }
    # api_key es opcional para openai_compatible (algunos endpoints locales
    # no exigen key); init_chat_model requiere un valor no vacío igual.
    kwargs["api_key"] = config.api_key or "not-required"
    if config.provider == "openai_compatible":
        kwargs["base_url"] = config.base_url

    return init_chat_model(**kwargs)
