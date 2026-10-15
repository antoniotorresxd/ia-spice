"""Autocorrección del planteamiento: si el motor no puede resolver lo que el
LLM transcribió (o ngspice no lo reproduce), el grafo vuelve una vez al
orquestador con su respuesta anterior y el error exacto.

Caso real: Franco P1.9 con gemini flash-lite, que puso la parte baja del pot
en paralelo con R1 en vez de en serie.
"""

from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module
from agents.graph import build_graph
from agents.orquestador.schema import AnalysisOutcome


def _planteamiento(netlist: str) -> AnalysisOutcome:
    return AnalysisOutcome.model_validate({
        "mode": "analysis",
        "netlist": netlist,
        "incognitas": ["R1"],
        "escenarios": [
            {"nombre": "Ganancia minima (k=0)", "valores": [{"simbolo": "k", "valor": "0"}], "mediciones": [{"expresion": "V(vout)/V(vin)", "valor": "1"}]},
            {"nombre": "Ganancia maxima (k=1)", "valores": [{"simbolo": "k", "valor": "1"}], "mediciones": [{"expresion": "V(vout)/V(vin)", "valor": "5"}]},
        ],
    })


MAL = _planteamiento("X1 vin vminus vout OPAMP\nR1 vminus 0 {R1}\nRP1 vout vminus {k*100k}\nRP2 vminus 0 {(1-k)*100k}\nVS vin 0 1\n")
BIEN = _planteamiento("X1 vin vminus vout OPAMP\nRP1 vout vminus {k*100k}\nRP2 vminus m {(1-k)*100k}\nR1 m 0 {R1}\nVS vin 0 1\n")


def _estado():
    return {
        "circuit_spec": {},
        "request_text": "Design a noninverting amplifier whose gain is variable over 1..5 V/V by means of a 100-k pot.",
        "normalized_spec": None, "pending_blocks": None, "component_values": {}, "netlists": {},
        "sim_results": {}, "iteration": 0, "history": [], "verdict": None, "documentation": {}, "outcome": None,
    }


def _correr(monkeypatch, respuestas: list):
    llamadas = []

    def extraer(chat_model, text, **kwargs):
        llamadas.append(kwargs)
        return respuestas[min(len(llamadas), len(respuestas)) - 1]

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(orquestador_module, "extract_orchestrator_outcome", extraer)
    final = build_graph().invoke(_estado(), {"configurable": {"thread_id": f"auto-{id(respuestas)}", "user_id": "u"}})
    return final, llamadas


def test_un_planteamiento_imposible_vuelve_una_vez_al_orquestador_con_el_error(monkeypatch):
    final, llamadas = _correr(monkeypatch, [MAL, BIEN])

    assert len(llamadas) == 2
    assert "correccion" not in llamadas[0]  # el primer intento es la llamada de siempre
    correccion = llamadas[1]["correccion"]
    assert "RP2 queda en corto" in correccion["error"]
    assert "RP2 vminus 0" in correccion["anterior"]
    # el segundo intento se resolvió y verificó
    outcome = final["outcome"]
    assert outcome["error"] is None
    assert outcome["resultados"]["planteamiento"]["incognitas"]["R1"] == 25000
    assert outcome["resultados"]["validacion"]["coincide"] is True
    # y el informe cuenta que hubo una corrección
    assert "corrigió" in outcome["informe"] and "RP2" in outcome["informe"]


def test_la_autocorreccion_se_intenta_una_sola_vez(monkeypatch):
    final, llamadas = _correr(monkeypatch, [MAL, MAL, MAL])

    assert len(llamadas) == 2
    assert final["outcome"]["error"] is not None
    assert "RP2" in final["outcome"]["error"]


def test_un_planteamiento_correcto_no_reintenta(monkeypatch):
    final, llamadas = _correr(monkeypatch, [BIEN])

    assert len(llamadas) == 1
    assert final["outcome"]["error"] is None
    assert "corrigió" not in final["outcome"]["informe"]


# Franco P1.10 con flash-lite: la respuesta en letras (V(vout) = -k·10·Vin)
# disparaba una "corrección", y en el reintento el LLM escribió su propio
# `.subckt OPAMP`, cuyos elementos internos quedaban flotando.
P110_EN_LETRAS = AnalysisOutcome.model_validate({
    "mode": "analysis",
    "netlist": "Vin vin 0 {Vin}\nRin vin vminus 10k\nRf vminus vout {k*100k}\nX1 0 vminus vout OPAMP\n",
})


def test_una_respuesta_en_letras_no_dispara_la_autocorreccion(monkeypatch):
    final, llamadas = _correr(monkeypatch, [P110_EN_LETRAS])

    assert len(llamadas) == 1
    assert final["outcome"]["error"] is None
    assert "corrigió" not in final["outcome"]["informe"]
    # V(vminus) = 0 no depende de Vin ni de k: se simula con valores nominales;
    # V(vout) = -10·k·Vin queda en letras y el informe lo dice
    assert "quedan en letras" in final["outcome"]["informe"]


def test_un_subckt_opamp_del_llm_se_ignora():
    from agents.analisis.planteamiento import analizar_planteamiento

    netlist = (
        "Vin vin 0 1\nRin vin vminus 10k\nRf vminus vout {k*100k}\nX1 0 vminus vout OPAMP\n"
        ".subckt OPAMP inp inn out\nRin_op inp inn 1e6\nEgain n1 0 inp inn 1e5\n"
        "Rp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n"
    )
    resultado = analizar_planteamiento({
        "netlist": netlist,
        "preguntas": [{"nombre": "Ganancia maxima (k=1)", "valores": [{"simbolo": "k", "valor": "1"}], "calcular": "V(vout)/V(vin)"}],
    })

    assert resultado["error"] is None
    assert resultado["resultados"]["planteamiento"]["preguntas"][0]["valor"] == -10
    assert resultado["resultados"]["validacion"]["coincide"] is True
