"""Barrido del parámetro de un planteamiento: cuando los casos difieren en un
solo símbolo (el cursor de un pot), el motor da la curva contra ese símbolo y
ngspice simula puntos encima. Corre el ngspice real."""

import pytest

from agents.analisis.node import analisis_node
from agents.analisis.planteamiento import analizar_planteamiento


def _pregunta(k: str, calcular: str = "V(o)/V(i)") -> dict:
    return {"nombre": f"k={k}", "valores": [{"simbolo": "k", "valor": k}], "calcular": calcular}


INVERSOR_CON_POT = {
    "netlist": "VI i 0 1\nR1 i n 10k\nRF n o {k*100k}\nX1 0 n o OPAMP\n",
    "preguntas": [_pregunta("0"), _pregunta("1")],
}


def test_un_pot_se_barre_de_un_extremo_al_otro_y_ngspice_recorre_la_curva():
    curva = analizar_planteamiento(INVERSOR_CON_POT)["curva"]

    assert curva["analysis_type"] == "dc" and curva["x_label"] == "k" and curva["y_unit"] == "V/V"
    assert curva["curve"][0] == {"x": 0.0, "y": 0.0}
    assert curva["curve"][-1]["y"] == pytest.approx(-10)
    assert len(curva["markers"]) == 5
    assert all(m["y"] == pytest.approx(-10 * m["x"], abs=1e-6) for m in curva["markers"])


def test_el_informe_da_la_expresion_del_barrido():
    informe = analizar_planteamiento(INVERSOR_CON_POT)["informe"]

    assert "## 4. Barrido de $k$" in informe
    assert "- 10 k" in informe
    assert "coinciden con la curva" in informe


def test_el_barrido_usa_las_incognitas_resueltas():
    # Franco P1.9: R1 sale de la ganancia máxima y la curva va de 1 a 5
    curva = analizar_planteamiento({
        "netlist": "VI i 0 1\nX1 i n o OPAMP\nRA o n {k*100k}\nRB n m {(1-k)*100k}\nR1 m 0 {R1}\n",
        "incognitas": ["R1"],
        "escenarios": [{"nombre": "k=1", "valores": [{"simbolo": "k", "valor": "1"}], "mediciones": [{"expresion": "V(o)/V(i)", "valor": "5"}]}],
        "preguntas": [_pregunta("0")],
    })["curva"]

    assert curva["curve"][0]["y"] == pytest.approx(1)
    assert curva["curve"][-1]["y"] == pytest.approx(5)
    assert len(curva["markers"]) == 5


def test_sin_un_unico_simbolo_que_cambie_no_hay_barrido():
    sin_barrido = analizar_planteamiento({
        "netlist": "VI i 0 1\nR1 i n 10k\nRF n o {k*100k}\nX1 0 n o OPAMP\n",
        "preguntas": [_pregunta("1")],
    })
    assert sin_barrido["curva"] is None


def test_el_nodo_publica_el_barrido_con_sus_marcadores():
    outcome = {"mode": "analysis", **INVERSOR_CON_POT}
    estado = {"outcome": outcome, "request_text": None}

    simulacion = analisis_node(estado)["sim_results"]["analisis"]

    assert simulacion["analysis_type"] == "dc"
    assert simulacion["x_label"] == "k"
    assert len(simulacion["markers"]) == 5
