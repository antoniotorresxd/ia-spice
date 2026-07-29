import time

import httpx
import pytest

from agents.llm import settings_client
from agents.llm.settings_client import (
    AgentLlmConfig,
    LlmSettingsError,
    fetch_agent_llm,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    settings_client._CACHE.clear()
    yield
    settings_client._CACHE.clear()


def _transport(handler):
    return httpx.MockTransport(handler)


def _ok_handler(request):
    return httpx.Response(
        200,
        json={
            "provider": "anthropic",
            "model": "claude-sonnet-5",
            "api_key": "sk-ant-test",
            "base_url": None,
        },
    )


def _fetch(handler, **kwargs):
    params = {
        "agent_id": "orchestrator",
        "user_id": "user-1",
        "base_url": "http://server.test",
        "token": "tok",
        "transport": _transport(handler),
    }
    params.update(kwargs)
    return fetch_agent_llm(**params)


def test_parses_valid_response():
    config = _fetch(_ok_handler)
    assert config == AgentLlmConfig(
        provider="anthropic",
        model="claude-sonnet-5",
        api_key="sk-ant-test",
        base_url=None,
    )


def test_sends_bearer_token():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return _ok_handler(request)

    _fetch(handler)
    assert seen["auth"] == "Bearer tok"


# Defecto corregido: antes nunca se enviaba userId y el server respondía 400.
def test_sends_agent_id_in_path_and_user_id_in_query():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return _ok_handler(request)

    _fetch(handler, agent_id="curator", user_id="user-42")
    assert "/api/internal/llm/agent/curator" in seen["url"]
    assert "userId=user-42" in seen["url"]


def test_404_raises_typed_error():
    def handler(request):
        return httpx.Response(404, json={"error": "No LLM configured for this agent"})

    with pytest.raises(LlmSettingsError, match="no LLM configured"):
        _fetch(handler)


def test_401_raises_typed_error():
    def handler(request):
        return httpx.Response(401, json={"error": "Unauthorized"})

    with pytest.raises(LlmSettingsError, match="unauthorized"):
        _fetch(handler)


def test_400_raises_typed_error():
    def handler(request):
        return httpx.Response(400, json={"error": "userId query param is required"})

    with pytest.raises(LlmSettingsError, match="unexpected status 400"):
        _fetch(handler)


def test_malformed_payload_raises_typed_error():
    def handler(request):
        return httpx.Response(200, json={"provider": "anthropic"})  # faltan campos

    with pytest.raises(LlmSettingsError, match="invalid payload"):
        _fetch(handler)


def test_connection_error_raises_typed_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LlmSettingsError, match="unreachable"):
        _fetch(handler)


def test_missing_env_raises_typed_error(monkeypatch):
    monkeypatch.delenv("SERVER_BASE_URL", raising=False)
    monkeypatch.delenv("AGENTS_SERVICE_TOKEN", raising=False)

    with pytest.raises(LlmSettingsError, match="not configured"):
        fetch_agent_llm(agent_id="orchestrator", user_id="user-1")


def test_cache_avoids_second_fetch_within_ttl():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    for _ in range(2):
        fetch_agent_llm(
            agent_id="orchestrator",
            user_id="user-1",
            base_url="http://server.test",
            token="tok",
            transport=transport,
        )
    assert calls["n"] == 1


# Defecto corregido: el cache usaba la clave fija "default", así que el segundo
# usuario recibía la configuración del primero, API key incluida.
def test_cache_is_not_shared_between_users():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(
            200,
            json={
                "provider": "anthropic",
                "model": f"model-para-{request.url.params.get('userId')}",
                "api_key": f"sk-de-{request.url.params.get('userId')}",
                "base_url": None,
            },
        )

    transport = _transport(handler)
    primero = fetch_agent_llm(
        agent_id="orchestrator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    segundo = fetch_agent_llm(
        agent_id="orchestrator", user_id="user-b",
        base_url="http://server.test", token="tok", transport=transport,
    )

    assert calls["n"] == 2
    assert primero.api_key == "sk-de-user-a"
    assert segundo.api_key == "sk-de-user-b"


def test_cache_is_not_shared_between_agents():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    fetch_agent_llm(
        agent_id="curator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    assert calls["n"] == 2


def test_cache_expires_after_ttl(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(time, "monotonic", lambda: fake_time["t"])

    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-1",
        base_url="http://server.test", token="tok", transport=transport,
    )
    fake_time["t"] += 61.0
    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-1",
        base_url="http://server.test", token="tok", transport=transport,
    )
    assert calls["n"] == 2
