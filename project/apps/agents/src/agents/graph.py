# project/apps/agents/src/agents/graph.py
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.escritura.node import escritura_node
from agents.shell.node import shell_node
from agents.state import CircuitState


def build_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("escritura", escritura_node)
    builder.add_node("shell", shell_node)

    builder.set_entry_point("escritura")
    builder.add_edge("escritura", "shell")
    builder.add_edge("shell", END)

    return builder.compile(checkpointer=MemorySaver())
