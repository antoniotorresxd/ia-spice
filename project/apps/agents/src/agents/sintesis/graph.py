from langgraph.graph import END, START, StateGraph

from agents.escritura.node import escritura_node
from agents.shell.node import shell_node
from agents.state import CircuitState


def build_sintesis_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("escritura", escritura_node)
    builder.add_node("shell", shell_node)
    builder.add_edge(START, "escritura")
    builder.add_edge("escritura", "shell")
    builder.add_edge("shell", END)
    return builder.compile()
