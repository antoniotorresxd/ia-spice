"""El corredor del banco del Franco, sin gastar llamadas: el "LLM" devuelve
el planteamiento de referencia (o uno roto) y se comprueba la calificación."""

from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module
from agents.analisis.biblioteca import EXCLUIR, cargar, recuperar
from agents.evaluacion.franco import calificar, correr_caso, tabla
from agents.orquestador.schema import AnalysisOutcome, ChatOutcome

ENTRADA = next(e for e in cargar() if e["id"] == "franco-ej1.4")


def _llm(monkeypatch, respuesta, vistos=None):
    def extraer(chat_model, text, **kwargs):
        if vistos is not None:
            # lo que se le habría mostrado como ejemplos
            vistos.extend(e["id"] for e in recuperar(text))
        return respuesta

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(orquestador_module, "extract_orchestrator_outcome", extraer)


def test_un_planteamiento_correcto_aprueba(monkeypatch):
    vistos = []
    _llm(monkeypatch, AnalysisOutcome.model_validate(ENTRADA["planteamiento"]), vistos)

    resultado = correr_caso(ENTRADA, "u")

    assert resultado["aprobado"] is True, resultado
    assert resultado["faltan"] == [] and resultado["verificado"] is True
    # el problema evaluado no se mostró como su propio ejemplo
    assert ENTRADA["id"] not in vistos
    assert EXCLUIR.get() == frozenset()


def test_el_modo_equivocado_reprueba(monkeypatch):
    _llm(monkeypatch, ChatOutcome(mode="chat", reply="no sé"))

    resultado = correr_caso(ENTRADA, "u")

    assert resultado["aprobado"] is False and resultado["modo_ok"] is False


def test_los_valores_se_comparan_por_nombre_o_por_valor():
    final = {"outcome": {"mode": "analysis", "resultados": {
        "validacion": {"coincide": True},
        # el LLM llamó Rf a RF y Ra a R1: igual cuentan
        "planteamiento": {"incognitas": {"Ra": 20000.0, "R2": 15000.0, "R3": 30000.0, "Rf": 120000.0}, "preguntas": []},
    }}}
    assert calificar(ENTRADA, final)["aprobado"] is True


def test_un_valor_distinto_al_del_libro_reprueba_y_lo_dice():
    final = {"outcome": {"mode": "analysis", "resultados": {
        "validacion": {"coincide": True},
        "planteamiento": {"incognitas": {"R1": 40000.0, "R2": 30000.0, "R3": 60000.0, "RF": 240000.0}, "preguntas": []},
    }}}
    resultado = calificar(ENTRADA, final)
    assert resultado["aprobado"] is False
    assert "R1 = 20k" in resultado["faltan"]
    assert "falta R1 = 20k" in tabla([resultado])
