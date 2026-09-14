from types import SimpleNamespace

import pytest

from agents.llm import prompts
from agents.llm.prompts import PromptFetchError, fetch_prompt


@pytest.fixture(autouse=True)
def _clear_client(monkeypatch):
    monkeypatch.setattr(prompts, "_client", None)
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    monkeypatch.delenv("LANGFUSE_HOST", raising=False)


def test_fetch_returns_prompt_and_production_label(monkeypatch):
    seen = []
    clients = []

    def get_prompt(name, *, label):
        seen.append((name, label))
        return SimpleNamespace(prompt="System prompt de prueba")

    def client():
        clients.append(True)
        return SimpleNamespace(get_prompt=get_prompt)

    monkeypatch.setattr(prompts, "Langfuse", client)
    for _ in range(2):
        assert fetch_prompt("orquestador-system") == "System prompt de prueba"
    assert seen == [("orquestador-system", "production")] * 2
    assert len(clients) == 1


@pytest.mark.parametrize("label", ["production", "latest"])
def test_fetch_compiles_variables(monkeypatch, label):
    seen = []
    compiled = []

    def compile(**kwargs):
        compiled.append(kwargs)
        return f"Catálogo: {kwargs['retrieved_circuits_catalog']}"

    def get_prompt(name, *, label):
        seen.append((name, label))
        return SimpleNamespace(prompt="uncompiled", compile=compile)

    monkeypatch.setattr(prompts, "Langfuse", lambda: SimpleNamespace(get_prompt=get_prompt))
    assert fetch_prompt(
        "orquestador-system", label=label, retrieved_circuits_catalog="circuitos"
    ) == "Catálogo: circuitos"
    assert seen == [("orquestador-system", label)]
    assert compiled == [{"retrieved_circuits_catalog": "circuitos"}]


@pytest.mark.parametrize("missing", ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"])
def test_missing_env_raises_without_constructing_client(monkeypatch, missing):
    monkeypatch.delenv(missing)
    calls = []
    monkeypatch.setattr(prompts, "Langfuse", lambda: calls.append(True))

    with pytest.raises(PromptFetchError, match="not configured"):
        fetch_prompt("orquestador-system")
    assert calls == []


def test_client_exception_is_wrapped(monkeypatch):
    error = RuntimeError("unreachable")

    def get_prompt(name, *, label):
        raise error

    monkeypatch.setattr(prompts, "Langfuse", lambda: SimpleNamespace(get_prompt=get_prompt))
    with pytest.raises(PromptFetchError, match="orquestador-system.*unreachable") as raised:
        fetch_prompt("orquestador-system")
    assert raised.value.__cause__ is error


def test_constructor_exception_is_wrapped(monkeypatch):
    def client():
        raise RuntimeError("initialization failed")

    monkeypatch.setattr(prompts, "Langfuse", client)
    with pytest.raises(PromptFetchError, match="initialization failed"):
        fetch_prompt("orquestador-system")


@pytest.mark.parametrize("configured", [False, True])
def test_api_attaches_handler_and_run_metadata_only_when_configured(monkeypatch, configured):
    from agents import api

    monkeypatch.delattr(api.app.state, "langfuse_handler", raising=False)
    monkeypatch.setenv("AGENTS_API_TOKEN", "token-test")
    if not configured:
        monkeypatch.delenv("LANGFUSE_SECRET_KEY")
    handler = object()
    calls = []

    def callback_handler():
        calls.append(True)
        return handler

    monkeypatch.setattr(api, "CallbackHandler", callback_handler)
    seen = []

    def invoke(state, *, config):
        seen.append(config)
        return state

    monkeypatch.setattr(api, "_graph", lambda: SimpleNamespace(invoke=invoke))
    try:
        for _ in range(2):
            api.create_run(
                api.RunRequest(user_id="user-1", execution_id="run-1", circuit_spec={}),
                authorization="Bearer token-test",
            )
        expected = {"configurable": {"user_id": "user-1", "thread_id": "run-1"}}
        if configured:
            expected["callbacks"] = [handler]
            expected["metadata"] = {
                "langfuse_session_id": "run-1",
                "langfuse_user_id": "user-1",
            }
        assert seen == [expected, expected]
        assert len(calls) == int(configured)
    finally:
        del api.app.state.langfuse_handler
