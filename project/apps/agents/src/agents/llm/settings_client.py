import os
import time

import httpx
from pydantic import BaseModel, ValidationError


class AgentLlmConfig(BaseModel):
    provider: str
    model: str
    api_key: str | None
    base_url: str | None


class LlmSettingsError(Exception):
    """Fallo al resolver el LLM desde el server. Nunca se propaga
    como excepción no capturada fuera del orquestador."""


# La clave incluye el usuario: una clave fija filtraría la API key de un
# usuario a otro durante la ventana del TTL.
_CACHE: dict[tuple[str, str], tuple[float, AgentLlmConfig]] = {}
_CACHE_TTL_SECONDS = 60.0


def fetch_agent_llm(
    agent_id: str,
    user_id: str,
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> AgentLlmConfig:
    """Obtiene del server la configuración de LLM de un agente para un usuario,
    con cache en memoria (TTL 60s) por par (agent_id, user_id).

    `transport` es inyectable para tests (httpx.MockTransport); en
    producción se usa el transport HTTP real de httpx.
    """
    now = time.monotonic()
    cache_key = (agent_id, user_id)
    cached = _CACHE.get(cache_key)
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    base_url = base_url or os.environ.get("SERVER_BASE_URL")
    token = token or os.environ.get("AGENTS_SERVICE_TOKEN")
    if not base_url or not token:
        raise LlmSettingsError(
            "SERVER_BASE_URL / AGENTS_SERVICE_TOKEN not configured"
        )

    client_kwargs = {"transport": transport} if transport is not None else {}
    try:
        with httpx.Client(**client_kwargs, timeout=5.0) as client:
            response = client.get(
                f"{base_url}/api/internal/llm/agent/{agent_id}",
                params={"userId": user_id},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.ConnectError as exc:
        raise LlmSettingsError(f"server unreachable: {exc}") from exc
    except httpx.TimeoutException as exc:
        raise LlmSettingsError(f"server timeout: {exc}") from exc

    if response.status_code == 404:
        raise LlmSettingsError(
            f"no LLM configured for agent {agent_id}"
        )
    if response.status_code == 401:
        raise LlmSettingsError("unauthorized: invalid AGENTS_SERVICE_TOKEN")
    if response.status_code != 200:
        raise LlmSettingsError(f"unexpected status {response.status_code} from server")

    try:
        config = AgentLlmConfig.model_validate(response.json())
    except ValidationError as exc:
        raise LlmSettingsError(f"invalid payload from server: {exc}") from exc

    _CACHE[cache_key] = (now, config)
    return config
