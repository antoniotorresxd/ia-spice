# project/apps/agents/src/agents/escritura/node.py
import logging
import os
import tempfile

from langchain_core.runnables import RunnableConfig

from agents.escritura.composition import assemble_composed_netlist
from agents.escritura.netlist import NETLIST_BUILDERS
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.state import CircuitState

logger = logging.getLogger(__name__)

AGENT_ID = "writer"


def get_chat_model(user_id: str):
    """Resuelve el LLM asignado al agente de escritura para el usuario.

    Sin llamador propio a partir de Slice B: la única vía que lo invocaba
    (mejorar un netlist de `catalog` en la iteración 0) se eliminó — un
    bloque `catalog` se sintetiza siempre por sustitución determinista de
    parámetros, o compuesto por el ensamblador de `.subckt`; "mejorar" un
    netlist que no lo necesitaba era justo lo que podía meter un valor
    equivocado sin que nada lo detectara antes de simular. Se conserva la
    función (en vez de borrarla) porque un bloque `generic` sigue autorizando
    su netlist vía LLM, solo que más arriba en el pipeline (orquestador +
    cálculo), no aquí.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


def _write(work_dir_prefix: str, netlist_text: str) -> str:
    work_dir = tempfile.mkdtemp(prefix=work_dir_prefix)
    netlist_path = os.path.join(work_dir, "circuit.cir")
    with open(netlist_path, "w") as f:
        f.write(netlist_text)
    return netlist_path


def escritura_node(state: CircuitState, config: RunnableConfig | None = None) -> dict:
    blocks_list = state["normalized_spec"]["blocks"]
    blocks = {b["id"]: b for b in blocks_list}
    connections = state["normalized_spec"].get("connections") or []

    if connections:
        # Una sola simulación para todo el diseño compuesto: los requisitos
        # de un bloque se miden sobre el circuito completo, no aislado.
        component_values = state.get("component_values", {})
        netlist_text = assemble_composed_netlist(blocks_list, connections, component_values)
        netlist_path = _write("agents-escritura-composed-", netlist_text)
        return {
            "netlists": {
                block_id: {"path": netlist_path, "text": netlist_text}
                for block_id in state["pending_blocks"]
            }
        }

    netlists = {}
    for block_id in state["pending_blocks"]:
        block = blocks[block_id]
        values = state.get("component_values", {}).get(block_id, {})

        builder = NETLIST_BUILDERS.get(block["type"])
        if not builder:
            raise ValueError(f"Tipo de bloque no soportado: {block['type']}")
        netlist_text = builder(block["params"], values)

        netlist_path = _write(f"agents-escritura-{block_id}-", netlist_text)
        netlists[block_id] = {"path": netlist_path, "text": netlist_text}

    return {"netlists": netlists}
