"""Cobertura: cada requisito que el LLM declara del enunciado tiene que
estar donde dice. Caso real: "vO = v2 - 3v1 con Ri1 = Ri2 = 100 k", donde
el LLM puso R3 = {Ri2} (Ri2 es R3 + R4) y ngspice verificó un problema que
no era el pedido."""

from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module
from agents.analisis.biblioteca import cargar
from agents.analisis.cobertura import faltantes
from agents.graph import build_graph
from agents.orquestador.schema import AnalysisOutcome

BIEN = next(e for e in cargar() if e["id"] == "franco-ej1.6")["planteamiento"]

# lo que hizo el LLM: Ri2 como valor de R3, sin medir Rin(V2), aunque declara
# el requisito como medición
MAL = {
    **BIEN,
    "netlist": BIEN["netlist"].replace("R3 v2 p {R3}", "R3 v2 p 100k"),
    "incognitas": ["R1", "RF", "R4"],
    "escenarios": [
        {**BIEN["escenarios"][0], "mediciones": [{"expresion": "V(o)", "valor": "-3"}, {"expresion": "Rin(V1)", "valor": "100k"}]},
        {**BIEN["escenarios"][1], "mediciones": [{"expresion": "V(o)", "valor": "1"}]},
    ],
}


def test_un_requisito_declarado_que_no_esta_se_detecta():
    faltan = faltantes(MAL)
    assert len(faltan) == 1
    assert "Ri2 = 100k" in faltan[0] and "Rin(V2)" in faltan[0]


def test_un_planteamiento_completo_no_tiene_faltantes():
    assert faltantes(BIEN) == []


def test_un_dato_que_no_esta_en_el_netlist_se_detecta():
    outcome = {**BIEN, "requisitos": [{"texto": "RL = 2k", "tipo": "dato", "expresion": "RL"}]}
    assert "RL" in faltantes(outcome)[0]


def test_una_pregunta_sin_expresion_se_detecta():
    outcome = {**BIEN, "requisitos": [{"texto": "iEE", "tipo": "pregunta", "expresion": ""}]}
    assert "no dice dónde" in faltantes(outcome)[0]


def _estado():
    return {
        "circuit_spec": {}, "request_text": "Design vO = v2 - 3v1 with Ri1 = Ri2 = 100 k.",
        "normalized_spec": None, "pending_blocks": None, "component_values": {}, "netlists": {},
        "sim_results": {}, "iteration": 0, "history": [], "verdict": None, "documentation": {}, "outcome": None,
    }


def test_lo_que_falta_vuelve_al_orquestador_y_el_reintento_lo_incluye(monkeypatch):
    respuestas = [AnalysisOutcome.model_validate(MAL), AnalysisOutcome.model_validate(BIEN)]
    llamadas = []

    def extraer(chat_model, text, **kwargs):
        llamadas.append(kwargs)
        return respuestas[len(llamadas) - 1]

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(orquestador_module, "extract_orchestrator_outcome", extraer)
    final = build_graph().invoke(_estado(), {"configurable": {"thread_id": "cobertura", "user_id": "u"}})

    assert len(llamadas) == 2
    assert "Ri2 = 100k" in llamadas[1]["correccion"]["error"]
    incognitas = final["outcome"]["resultados"]["planteamiento"]["incognitas"]
    assert incognitas["R3"] == 75000 and incognitas["R4"] == 25000
    assert "Requisitos del enunciado" in final["outcome"]["informe"]
