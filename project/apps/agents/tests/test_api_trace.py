from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from agents.api import app

client = TestClient(app)
TOKEN = "token-de-prueba-suficientemente-largo"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("AGENTS_API_TOKEN", TOKEN)


def test_trace_requiere_auth():
    res = client.get("/runs/exec-123/trace")
    assert res.status_code == 401


def test_trace_sin_langfuse_retorna_unavailable(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    res = client.get("/runs/exec-123/trace", headers={"authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "unavailable"
    assert data["traceId"] == "exec-123"


def test_trace_con_mock_langfuse_retorna_ready(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-mock")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-mock")

    mock_obs = SimpleNamespace(
        id="obs-1",
        name="ChatOpenAI",
        type="GENERATION",
        model="models/gemini-3.5-flash-lite",
        start_time=None,
        end_time=None,
        latency=1.234,
        input="¿Cómo diseñar un divisor?",
        output="R1=1k, R2=2k",
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30),
        level="DEFAULT",
        status_message=None,
    )
    mock_detail = SimpleNamespace(
        id="trace-abc",
        session_id="exec-123",
        timestamp=None,
        latency=1.5,
        total_cost=0.0,
        observations=[mock_obs],
    )

    mock_client = MagicMock()
    mock_client.api.trace.list.return_value = SimpleNamespace(data=[SimpleNamespace(id="trace-abc")])
    mock_client.api.trace.get.return_value = mock_detail

    monkeypatch.setattr("agents.api._langfuse_client", lambda: mock_client)

    res = client.get("/runs/exec-123/trace", headers={"authorization": f"Bearer {TOKEN}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["traceId"] == "trace-abc"
    assert len(data["steps"]) == 1
    step = data["steps"][0]
    assert step["model"] == "models/gemini-3.5-flash-lite"
    assert step["durationSec"] == 1.234
    assert step["usage"]["totalTokens"] == 30


def test_handler_con_claves_queda_con_tracing_activo(monkeypatch):
    # Regresión: CallbackHandler(public_key=...) sin un cliente Langfuse ya
    # inicializado con esa clave devuelve un cliente desactivado ("fake") y
    # ninguna corrida se traza. El handler se crea al arrancar, antes que
    # cualquier Langfuse(), así que el proceso entero quedaba sin trazas.
    from agents import api

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-prueba-handler")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-prueba-handler")
    monkeypatch.setenv("LANGFUSE_HOST", "http://localhost:1")
    monkeypatch.delattr(app.state, "langfuse_handler", raising=False)

    handler = api._langfuse_handler()

    assert handler is not None
    lf = handler._langfuse_client
    assert lf._tracing_enabled is True
    assert lf._resources.public_key == "pk-lf-prueba-handler"
    monkeypatch.delattr(app.state, "langfuse_handler", raising=False)
