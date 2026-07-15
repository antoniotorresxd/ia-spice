import time

import httpx
import pytest

from agents.llm import settings_client
from agents.llm.settings_client import (
    ActiveLlmConfig,
    LlmSettingsError,
    fetch_active_llm,
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


def test_fetch_active_llm_parses_valid_response():
    config = fetch_active_llm(
        base_url="http://server.test",
        token="tok",
        transport=_transport(_ok_handler),
    )
    assert config == ActiveLlmConfig(
        provider="anthropic",
        model="claude-sonnet-5",
        api_key="sk-ant-test",
        base_url=None,
    )


def test_fetch_active_llm_sends_bearer_token():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return _ok_handler(request)

    fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))
    assert seen["auth"] == "Bearer tok"


def test_fetch_active_llm_404_raises_typed_error():
    def handler(request):
        return httpx.Response(404, json={"error": "No active LLM configured"})

    with pytest.raises(LlmSettingsError, match="no active LLM"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_401_raises_typed_error():
    def handler(request):
        return httpx.Response(401, json={"error": "Unauthorized"})

    with pytest.raises(LlmSettingsError, match="unauthorized"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_malformed_payload_raises_typed_error():
    def handler(request):
        return httpx.Response(200, json={"provider": "anthropic"})  # faltan campos

    with pytest.raises(LlmSettingsError, match="invalid payload"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_connection_error_raises_typed_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LlmSettingsError, match="unreachable"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_cache_avoids_second_fetch_within_ttl():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="ttl-test")
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="ttl-test")
    assert calls["n"] == 1


def test_cache_expires_after_ttl(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(time, "monotonic", lambda: fake_time["t"])

    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="expiry-test")
    fake_time["t"] += 61.0
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="expiry-test")
    assert calls["n"] == 2
