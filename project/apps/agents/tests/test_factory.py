import pytest

from agents.llm.factory import UnsupportedProviderError, build_chat_model
from agents.llm.settings_client import AgentLlmConfig


def test_build_chat_model_anthropic():
    model = build_chat_model(
        AgentLlmConfig(provider="anthropic", model="claude-sonnet-5", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_openai():
    model = build_chat_model(
        AgentLlmConfig(provider="openai", model="gpt-4o", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_google():
    model = build_chat_model(
        AgentLlmConfig(provider="google", model="gemini-2.0-flash", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_openai_compatible_with_base_url():
    model = build_chat_model(
        AgentLlmConfig(
            provider="openai_compatible",
            model="llama3.1:8b",
            api_key=None,
            base_url="http://localhost:11434/v1",
        )
    )
    assert model is not None


def test_build_chat_model_unsupported_provider_raises():
    with pytest.raises(UnsupportedProviderError):
        build_chat_model(
            AgentLlmConfig(provider="not_a_provider", model="x", api_key="k", base_url=None)
        )


def test_build_chat_model_passes_the_configured_temperature(monkeypatch):
    captured = {}

    def fake_init_chat_model(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr("agents.llm.factory.init_chat_model", fake_init_chat_model)

    build_chat_model(
        AgentLlmConfig(
            provider="openai",
            model="gpt-4o-mini",
            api_key="sk-test",
            base_url=None,
        )
    )

    assert captured["temperature"] == 0.0
