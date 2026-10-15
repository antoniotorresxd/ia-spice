"""Alimentación del op-amp: corrientes de los rieles y potencia interna.

Franco, sección de potencia (ej. 1.15): inversor con R1 = 10k, R2 = 20k,
vI = 3 V y una carga de 2k, con ±15 V e IQ = 0.5 mA: vO = -6 V, la salida
absorbe 3.3 mA, iCC = 0.5 mA, iEE = 3.8 mA y la potencia interna es
44.7 mW. Todo verificado con ngspice (que no reporta la corriente de una
VCVS: la de la salida sale por KCL en su nodo).
"""

import pytest

from agents.analisis.planteamiento import analizar_planteamiento

INVERSOR = "VI i 0 {vI}\nR1 i n 10k\nR2 n o 20k\nRL o 0 2k\nX1 0 n o OPAMP iq=0.5m vcc=15 vee=-15\n"


def _preguntas(vi: str) -> list[dict]:
    valores = [{"simbolo": "vI", "valor": vi}]
    return [
        {"nombre": n, "valores": valores, "calcular": c}
        for n, c in (("vO", "V(o)"), ("iO", "IO(X1)"), ("iCC", "ICC(X1)"), ("iEE", "IEE(X1)"), ("pOA", "POA(X1)"))
    ]


def _valores(resultado) -> dict:
    return {p["calcular"]: p["valor"] for p in resultado["resultados"]["planteamiento"]["preguntas"]}


def test_franco_1_15_corrientes_de_alimentacion_y_potencia():
    resultado = analizar_planteamiento({"netlist": INVERSOR, "preguntas": _preguntas("3")})

    assert _valores(resultado) == pytest.approx(
        {"V(o)": -6, "IO(X1)": -3.3e-3, "ICC(X1)": 0.5e-3, "IEE(X1)": 3.8e-3, "POA(X1)": 44.7e-3}
    )
    assert resultado["resultados"]["validacion"]["coincide"] is True
    assert "i_{CC}[X1]" in resultado["informe"]


def test_si_la_salida_entrega_corriente_la_toma_de_vcc():
    resultado = analizar_planteamiento({"netlist": INVERSOR, "preguntas": _preguntas("-3")})

    # vO = +6 V: la salida entrega 3.3 mA, que salen de VCC
    assert _valores(resultado) == pytest.approx(
        {"V(o)": 6, "IO(X1)": 3.3e-3, "ICC(X1)": 3.8e-3, "IEE(X1)": 0.5e-3, "POA(X1)": 15e-3 + 9 * 3.3e-3}
    )
    assert resultado["resultados"]["validacion"]["coincide"] is True


def test_una_salida_fuera_de_los_rieles_se_avisa():
    resultado = analizar_planteamiento({"netlist": INVERSOR, "preguntas": _preguntas("10")})

    assert "satura" in resultado["informe"]
    assert "-20 V" in resultado["informe"]


def test_la_potencia_sin_alimentacion_declarada_lo_dice():
    resultado = analizar_planteamiento({
        "netlist": INVERSOR.replace(" iq=0.5m vcc=15 vee=-15", ""),
        "preguntas": [{"nombre": "p", "valores": [{"simbolo": "vI", "valor": "3"}], "calcular": "POA(X1)"}],
    })

    assert "vcc" in resultado["error"]
