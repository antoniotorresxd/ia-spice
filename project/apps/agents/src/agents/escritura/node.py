# project/apps/agents/src/agents/escritura/node.py
import logging
import os
import tempfile

from langchain_core.runnables import RunnableConfig

from agents.escritura.netlist import NETLIST_BUILDERS, generate_writer_netlist
from agents.knowledge.circuit_client import fetch_circuit_detail
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
from agents.state import CircuitState

logger = logging.getLogger(__name__)

AGENT_ID = "writer"


def get_chat_model(user_id: str):
    """Resuelve el LLM asignado al agente de escritura para el usuario."""
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)


def escritura_node(state: CircuitState, config: RunnableConfig | None = None) -> dict:
    blocks = {b["id"]: b for b in state["normalized_spec"]["blocks"]}
    user_id = (config or {}).get("configurable", {}).get("user_id")
    iteration = state.get("iteration", 0)

    chat_model = None
    # Solo invocamos al LLM escritor en la iteración 0 (síntesis inicial).
    # En iteraciones posteriores (ajustes del curador), los valores de componentes
    # ya fueron optimizados paramétricamente en component_values y se reconstruye
    # el netlist de inmediato mediante la plantilla (0 ms) en lugar de repetir
    # una llamada costosa al LLM que ignoraría los valores ajustados.
    if user_id and iteration == 0:
        try:
            chat_model = get_chat_model(user_id)
        except LlmSettingsError as exc:
            logger.info("Writer LLM no disponible para user_id %s: %s; usando síntesis determinista", user_id, exc)
        except Exception as exc:
            logger.warning("Fallo al inicializar Writer LLM: %s; usando síntesis determinista", exc)

    netlists = {}
    for block_id in state["pending_blocks"]:
        block = blocks[block_id]
        values = state.get("component_values", {}).get(block_id, {})
        netlist_text = None

        if block["type"] == "catalog" and iteration == 0 and chat_model is not None:
            circuit_id = block["params"].get("circuit_id")
            circuit = fetch_circuit_detail(circuit_id)
            if circuit:
                try:
                    netlist_text = generate_writer_netlist(
                        chat_model,
                        circuit=circuit,
                        params=block["params"].get("params", {}),
                        goal=block.get("goal", {}),
                        computed_values=values,
                    )
                except Exception as exc:
                    logger.warning(
                        "Writer LLM falló al generar netlist para %s: %s; recurriendo a plantilla del catálogo",
                        circuit_id,
                        exc,
                    )

        if netlist_text is None:
            builder = NETLIST_BUILDERS.get(block["type"])
            if not builder:
                raise ValueError(f"Tipo de bloque no soportado: {block['type']}")
            netlist_text = builder(block["params"], values)

        work_dir = tempfile.mkdtemp(prefix=f"agents-escritura-{block_id}-")
        netlist_path = os.path.join(work_dir, "circuit.cir")
        with open(netlist_path, "w") as f:
            f.write(netlist_text)

        netlists[block_id] = {"path": netlist_path, "text": netlist_text}

    return {"netlists": netlists}
