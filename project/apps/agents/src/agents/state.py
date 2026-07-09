# project/apps/agents/src/agents/state.py
from typing import TypedDict


class CircuitState(TypedDict):
    circuit_spec: dict

    netlist_path: str | None
    netlist_text: str | None

    raw_output_path: str | None
    metrics: dict | None
    sim_error: str | None
