# project/apps/agents/src/agents/escritura/node.py
import os
import tempfile

from agents.escritura.netlist import build_voltage_divider_netlist
from agents.state import CircuitState


def escritura_node(state: CircuitState) -> dict:
    spec = state["circuit_spec"]
    netlist_text = build_voltage_divider_netlist(
        v_in=spec["v_in"], r1=spec["r1"], r2=spec["r2"]
    )

    work_dir = tempfile.mkdtemp(prefix="agents-escritura-")
    netlist_path = os.path.join(work_dir, "circuit.cir")
    with open(netlist_path, "w") as f:
        f.write(netlist_text)

    return {"netlist_text": netlist_text, "netlist_path": netlist_path}
