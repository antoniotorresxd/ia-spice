import os
import time

import httpx
from pydantic import BaseModel, ValidationError


class ActiveLlmConfig(BaseModel):
    provider: str
    model: str
    api_key: str | None
    base_url: str | None


class LlmSettingsError(Exception):
    """Fallo al resolver el LLM activo desde el server. Nunca se propaga
    como excepción no capturada fuera del orquestador."""


_CACHE: dict[str, tuple[float, ActiveLlmConfig]] = {}
_CACHE_TTL_SECONDS = 60.0


def fetch_active_llm(
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
    cache_key: str = "default",
) -> ActiveLlmConfig:
    """Obtiene el LLM activo desde el server, con cache en memoria (TTL 60s).

    `transport` es inyectable para tests (httpx.MockTransport); en
    producción se usa el transport HTTP real de httpx.
    """
    now = time.monotonic()
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
                f"{base_url}/api/internal/llm/active",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.ConnectError as exc:
        raise LlmSettingsError(f"server unreachable: {exc}") from exc
    except httpx.TimeoutException as exc:
        raise LlmSettingsError(f"server timeout: {exc}") from exc

    if response.status_code == 404:
        raise LlmSettingsError("no active LLM configured on the server")
    if response.status_code == 401:
        raise LlmSettingsError("unauthorized: invalid AGENTS_SERVICE_TOKEN")
    if response.status_code != 200:
        raise LlmSettingsError(f"unexpected status {response.status_code} from server")

    try:
        config = ActiveLlmConfig.model_validate(response.json())
    except ValidationError as exc:
        raise LlmSettingsError(f"invalid payload from server: {exc}") from exc

    _CACHE[cache_key] = (now, config)
    return config
