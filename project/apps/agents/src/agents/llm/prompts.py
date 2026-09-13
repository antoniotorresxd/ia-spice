"""System prompts compartidos, resueltos desde Langfuse con cache del SDK."""

import os

from langfuse import Langfuse


class PromptFetchError(Exception):
    """Fallo al obtener un prompt de Langfuse. Nunca se propaga
    como excepción no capturada fuera del nodo que lo llama."""


_client: Langfuse | None = None


def _get_client() -> Langfuse:
    global _client
    if _client is None:
        if not os.environ.get("LANGFUSE_PUBLIC_KEY") or not os.environ.get("LANGFUSE_SECRET_KEY"):
            raise PromptFetchError(
                "LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not configured"
            )
        _client = Langfuse()
    return _client


def fetch_prompt(name: str) -> str:
    """Obtiene un system prompt con label production y cache del SDK.

    Punto de indirección a nivel de módulo: los tests lo sustituyen
    (monkeypatch) para no depender de red ni de Langfuse.
    """
    try:
        client = _get_client()
        return client.get_prompt(name, label="production").prompt
    except PromptFetchError:
        raise
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del SDK se tipa
        raise PromptFetchError(f"Langfuse prompt {name!r} fetch failed: {exc}") from exc
