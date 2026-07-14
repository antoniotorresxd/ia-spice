from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from agents.calculo.formulas import FORMULAS
from agents.state import CircuitState


class WorkerInput(TypedDict):
    block: dict


def master_node(state: CircuitState) -> dict:
    # el master no muta estado; el fan-out ocurre en la arista condicional
    return {}


def dispatch_workers(state: CircuitState) -> list[Send]:
    return [
        Send("worker", {"block": block})
        for block in state["normalized_spec"]["blocks"]
    ]


def worker_node(payload: WorkerInput) -> dict:
    block = payload["block"]
    values = FORMULAS[block["type"]](block["params"])
    return {"component_values": {block["id"]: values}}


def build_calculo_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("master", master_node)
    builder.add_node("worker", worker_node)
    builder.add_edge(START, "master")
    builder.add_conditional_edges("master", dispatch_workers, ["worker"])
    builder.add_edge("worker", END)
    return builder.compile()
