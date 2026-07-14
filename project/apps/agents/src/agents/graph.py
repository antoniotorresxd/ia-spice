# project/apps/agents/src/agents/graph.py
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agents.calculo.graph import build_calculo_graph
from agents.curador.node import curador_node, route_after_curador
from agents.orquestador.node import orquestador_node, route_after_orquestador
from agents.sintesis.graph import build_sintesis_graph
from agents.state import CircuitState


def _calculo_node(state: CircuitState) -> dict:
    # Se invoca el subgrafo de forma independiente (no como nodo-subgrafo
    # adjunto directamente) para que no comparta namespace de checkpoint
    # con el grafo padre: 'sintesis' es revisitado en el lazo del curador,
    # y si el subgrafo comparte checkpointer/namespace con el padre,
    # LangGraph reutiliza pending writes de invocaciones previas del mismo
    # nodo y duplica valores en canales con reducer (p. ej. 'history').
    result = build_calculo_graph().invoke(state)
    return {"component_values": result["component_values"]}


def _sintesis_node(state: CircuitState) -> dict:
    result = build_sintesis_graph().invoke(state)
    return {"netlists": result["netlists"], "sim_results": result["sim_results"]}


def build_graph():
    builder = StateGraph(CircuitState)
    builder.add_node("orquestador", orquestador_node)
    builder.add_node("calculo", _calculo_node)
    builder.add_node("sintesis", _sintesis_node)
    builder.add_node("curador", curador_node)

    builder.set_entry_point("orquestador")
    builder.add_conditional_edges(
        "orquestador",
        route_after_orquestador,
        {"continue": "calculo", "reject": END},
    )
    builder.add_edge("calculo", "sintesis")
    builder.add_edge("sintesis", "curador")
    builder.add_conditional_edges(
        "curador",
        route_after_curador,
        {"adjust": "sintesis", "done": END},
    )

    return builder.compile(checkpointer=MemorySaver())
