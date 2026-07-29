"""Prueba de integración real: agents resuelve la configuración de LLM de un
usuario contra el server y extrae un circuit_spec de lenguaje natural.

Se salta salvo que estén configuradas SERVER_BASE_URL, AGENTS_SERVICE_TOKEN y
LIVE_LLM_USER_ID, y requiere que ese usuario tenga una conexión con credencial
válida asignada al agente 'orchestrator'.

    SERVER_BASE_URL=http://localhost:3001 \
    AGENTS_SERVICE_TOKEN=<token> \
    LIVE_LLM_USER_ID=<id-del-usuario> \
    uv run pytest tests/test_llm_live.py -m live_llm -v
"""

import os

import pytest

from agents.llm.factory import build_chat_model
from agents.llm.settings_client import fetch_agent_llm
from agents.orquestador.node import orquestador_node

pytestmark = pytest.mark.live_llm

_REQUIRED = ("SERVER_BASE_URL", "AGENTS_SERVICE_TOKEN", "LIVE_LLM_USER_ID")

skip_unless_configured = pytest.mark.skipif(
    not all(os.environ.get(name) for name in _REQUIRED),
    reason=f"requiere {', '.join(_REQUIRED)}",
)


@skip_unless_configured
def test_resuelve_la_configuracion_del_usuario_desde_el_server():
    user_id = os.environ["LIVE_LLM_USER_ID"]

    config = fetch_agent_llm("orchestrator", user_id)

    assert config.provider in {"anthropic", "openai", "google", "openai_compatible"}
    assert config.model, "el modelo asignado al orquestador no puede venir vacío"
    if config.provider != "openai_compatible":
        assert config.api_key, "la conexión asignada debe traer API key"


@skip_unless_configured
def test_construye_el_chat_model_con_esa_configuracion():
    config = fetch_agent_llm("orchestrator", os.environ["LIVE_LLM_USER_ID"])
    assert build_chat_model(config) is not None


@skip_unless_configured
def test_el_orquestador_extrae_un_circuit_spec_de_lenguaje_natural():
    result = orquestador_node(
        {"request_text": "un divisor de voltaje que baje 12 V a 5 V"},
        {"configurable": {"user_id": os.environ["LIVE_LLM_USER_ID"]}},
    )

    assert result.get("verdict") is None, f"el orquestador rechazó: {result.get('verdict')}"
    assert result["pending_blocks"], "no se produjo ningún sub-bloque"
    assert result["circuit_spec"]["blocks"][0]["type"] == "voltage_divider"


@skip_unless_configured
def test_un_usuario_sin_configuracion_es_rechazado_sin_reventar():
    result = orquestador_node(
        {"request_text": "un divisor de voltaje que baje 12 V a 5 V"},
        {"configurable": {"user_id": "usuario-que-no-existe-00000000"}},
    )

    assert result["verdict"]["status"] == "rejected"
    assert "llm_settings_unavailable" in result["verdict"]["reason"]
