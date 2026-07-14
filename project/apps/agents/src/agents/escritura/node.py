# project/apps/agents/src/agents/escritura/node.py
import os
import tempfile

from agents.escritura.netlist import NETLIST_BUILDERS
from agents.state import CircuitState


def escritura_node(state: CircuitState) -> dict:
    blocks = {b["id"]: b for b in state["normalized_spec"]["blocks"]}

    netlists = {}
    for block_id in state["pending_blocks"]:
        block = blocks[block_id]
        values = state["component_values"][block_id]
        netlist_text = NETLIST_BUILDERS[block["type"]](block["params"], values)

        work_dir = tempfile.mkdtemp(prefix=f"agents-escritura-{block_id}-")
        netlist_path = os.path.join(work_dir, "circuit.cir")
        with open(netlist_path, "w") as f:
            f.write(netlist_text)

        netlists[block_id] = {"path": netlist_path, "text": netlist_text}

    return {"netlists": netlists}
