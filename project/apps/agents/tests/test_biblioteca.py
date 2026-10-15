"""Cada planteamiento de referencia da la respuesta del libro, verificada por
ngspice. Es la red contra regresiones del motor: si un cambio rompe un
problema que ya se resolvía, falla aquí, sin gastar llamadas al LLM.

Lo que estas pruebas NO cubren es que el LLM llegue a este planteamiento
desde el enunciado: eso lo mide el banco contra el LLM real
(`python -m agents.evaluacion.franco`).
"""

import pytest
import sympy as sp

from agents.analisis.biblioteca import cargar, como_ejemplo, recuperar
from agents.analisis.planteamiento import _cantidad, analizar_planteamiento
from agents.orquestador.schema import AnalysisOutcome

ENTRADAS = cargar()


def _numero(valor) -> float:
    return float(sp.N(_cantidad(valor)))


@pytest.mark.parametrize("entrada", ENTRADAS, ids=[e["id"] for e in ENTRADAS])
def test_el_planteamiento_de_referencia_da_la_respuesta_del_libro(entrada):
    # el ejemplo que ve el LLM tiene que ser un outcome válido del schema
    AnalysisOutcome.model_validate(entrada["planteamiento"])

    resultado = analizar_planteamiento(entrada["planteamiento"])

    assert resultado["error"] is None, resultado["error"]
    esperado = entrada["esperado"]
    tolerancia = esperado.get("tolerancia", 0.005)
    planteamiento = resultado["resultados"]["planteamiento"]
    for nombre, valor in (esperado.get("incognitas") or {}).items():
        assert planteamiento["incognitas"][nombre] == pytest.approx(_numero(valor), rel=tolerancia), nombre
    nombres = [p.get("nombre") for p in entrada["planteamiento"].get("preguntas") or []]
    respuestas = dict(zip(nombres, (p["valor"] for p in planteamiento["preguntas"])))
    for nombre, valor in (esperado.get("preguntas") or {}).items():
        assert respuestas[nombre] == pytest.approx(_numero(valor), rel=tolerancia, abs=1e-9), nombre
    # y ngspice reproduce todo lo planteado
    assert resultado["resultados"]["validacion"]["coincide"] is True, planteamiento["fallas"]


def test_un_pedido_recupera_su_problema_parecido():
    pedido = "Using standard 5% resistances, design a circuit such that vO = -(v1 + 2 v2)"
    assert recuperar(pedido)[0]["id"] == "franco-ej1.4"


def test_el_banco_puede_excluir_el_problema_que_evalua():
    pedido = ENTRADAS[0]["enunciado"]
    assert ENTRADAS[0]["id"] not in [e["id"] for e in recuperar(pedido, excluir={ENTRADAS[0]["id"]})]


def test_un_pedido_de_otro_tema_no_recibe_ejemplos():
    assert recuperar("hola, ¿cómo estás?") == []


def test_el_ejemplo_trae_enunciado_y_respuesta_en_json():
    texto = como_ejemplo(ENTRADAS[0])
    assert texto.startswith("Enunciado: ") and '"netlist"' in texto
