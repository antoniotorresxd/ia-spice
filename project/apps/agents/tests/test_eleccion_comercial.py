"""Una incógnita que las mediciones dejan libre se elige de la serie.

Franco, ejemplo 1.4: "Using standard 5% resistances, design a circuit such
that vO = -2(3v1 + 4v2 + 2v3)". Solución del libro: R1 = 20k, R2 = 15k,
R3 = 30k y RF = 120k. Con un escenario por entrada, ngspice comprueba cada
peso por separado (con todas en 1 V, 7 + 7 + 4 pasaría por 6 + 8 + 4).
"""

import pytest

from agents.analisis.planteamiento import analizar_planteamiento


def _escenario(entrada: str, salida: str) -> dict:
    valores = [{"simbolo": v, "valor": "1" if v == entrada else "0"} for v in ("v1", "v2", "v3")]
    return {"nombre": f"solo {entrada}", "valores": valores, "mediciones": [{"expresion": "V(o)", "valor": salida}]}


SUMADOR = {
    "netlist": (
        "V1 v1 0 {v1}\nV2 v2 0 {v2}\nV3 v3 0 {v3}\n"
        "R1 v1 n {R1}\nR2 v2 n {R2}\nR3 v3 n {R3}\nRF n o {RF}\nX1 0 n o OPAMP\n"
    ),
    "incognitas": ["R1", "R2", "R3", "RF"],
    "escenarios": [_escenario("v1", "-6"), _escenario("v2", "-8"), _escenario("v3", "-4")],
}


def test_franco_1_4_da_la_solucion_del_libro():
    resultado = analizar_planteamiento({**SUMADOR, "serie_resistencias": "E24"})

    assert resultado["error"] is None
    assert resultado["resultados"]["planteamiento"]["incognitas"] == pytest.approx(
        {"R1": 20e3, "R2": 15e3, "R3": 30e3, "RF": 120e3}
    )
    # cada peso, verificado por separado
    assert resultado["resultados"]["validacion"]["coincide"] is True
    assert "dejan libre $R_{F}$" in resultado["informe"]
    assert "serie E24" in resultado["informe"]


def test_sin_serie_pedida_se_elige_de_e24():
    resultado = analizar_planteamiento(SUMADOR)

    assert resultado["resultados"]["planteamiento"]["incognitas"]["RF"] == pytest.approx(120e3)


def test_otra_serie_da_otra_eleccion():
    # en E12 no hay un RF con RF/6, RF/8 y RF/4 todas en la serie: se elige
    # el que deja la peor lo más cerca posible, y ngspice igual lo verifica
    resultado = analizar_planteamiento({**SUMADOR, "serie_resistencias": "E12"})

    assert resultado["error"] is None
    assert resultado["resultados"]["validacion"]["coincide"] is True
    assert "serie E12" in resultado["informe"]


def test_una_incognita_libre_que_no_es_resistencia_sigue_siendo_falta_de_datos():
    resultado = analizar_planteamiento({
        "netlist": "VS s 0 1\nGM 0 o s 0 {Ag}\nRO o 0 {Ro}\n",
        "incognitas": ["Ag", "Ro"],
        "escenarios": [{"nombre": "a", "valores": [], "mediciones": [{"expresion": "V(o)", "valor": "2"}]}],
    })

    assert "faltan datos" in resultado["error"]
