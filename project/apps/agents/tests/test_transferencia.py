"""Dominio s: funciones de transferencia, sus parámetros estándar y su Bode,
verificados contra un barrido .ac de ngspice."""

import math

import pytest
import sympy as sp

from agents.analisis.planteamiento import resolver_planteamiento

RC = "VI i 0 AC 1\nR1 i o 1k\nC1 o 0 1u\n"

# KRC pasa bajos de ganancia unitaria (Franco §3.5): seguidor y dos RC.
SALLEN_KEY = (
    "VI i 0 AC 1\nR1 i a {R1}\nR2 a p {R2}\nC2 p 0 {C2}\nC1 a o {C1}\nX1 p o o OPAMP\n"
)


def test_transferencia_numerica_con_parametros_y_bode():
    r = resolver_planteamiento({"netlist": RC, "preguntas": [{"tipo": "transferencia", "calcular": "V(o)/V(i)"}]})

    assert r["error"] is None
    t = r["preguntas"][0]["transferencia"]
    s = sp.Symbol("s")
    assert sp.simplify(sp.sympify(t["h"], locals={"s": s}) - 1 / (1 + s / 1000)) == 0
    assert t["tipo"] == "pasa bajos"
    assert t["h0"] == pytest.approx(1)
    assert t["f0"] == pytest.approx(1000 / (2 * math.pi))
    assert t["polos"] == [pytest.approx(-1000)]
    # Bode: a f0 la magnitud cae 3 dB
    curva = t["bode"]
    assert len(curva) >= 30
    cerca = min(curva, key=lambda p: abs(p["x"] - t["f0"]))
    assert cerca["y"] == pytest.approx(-3.01, abs=0.1)


def test_ngspice_ac_confirma_la_transferencia():
    r = resolver_planteamiento({"netlist": RC, "preguntas": [{"tipo": "transferencia", "calcular": "V(o)/V(i)"}]})
    v = r["verificacion"]["preguntas"][0]
    assert v["error"] is None
    assert v["coincide"] is True
    assert len(v["frecuencias"]) >= 3


def test_transferencia_simbolica_del_sallen_key():
    r = resolver_planteamiento({"netlist": SALLEN_KEY, "preguntas": [{"tipo": "transferencia", "calcular": "V(o)/V(i)"}]})

    assert r["error"] is None
    t = r["preguntas"][0]["transferencia"]
    R1, R2, C1, C2 = sp.symbols("R1 R2 C1 C2", positive=True)
    w0 = sp.sympify(t["w0"], locals={"R1": R1, "R2": R2, "C1": C1, "C2": C2})
    q = sp.sympify(t["q"], locals={"R1": R1, "R2": R2, "C1": C1, "C2": C2})
    assert sp.simplify(w0 - 1 / sp.sqrt(R1 * R2 * C1 * C2)) == 0
    assert sp.simplify(q - sp.sqrt(R1 * R2 * C1 * C2) / ((R1 + R2) * C2)) == 0
    assert t["tipo"] == "pasa bajos"
    # sin números no hay Bode ni simulación, y se dice
    assert t["bode"] == []
    assert "simbólic" in r["verificacion"]["preguntas"][0]["error"]


def test_diseno_por_una_condicion_en_s():
    # f0 = 1 kHz con R1 = R2 = R y C1 = C2 = 10 nF  =>  R = 1/(2π·1k·10n)
    r = resolver_planteamiento({
        "netlist": SALLEN_KEY.replace("{R1}", "{R}").replace("{R2}", "{R}"),
        "incognitas": ["R"],
        "escenarios": [{"valores": {"C1": "10n", "C2": "10n"}, "mediciones": {"f0(V(o)/V(i))": "1k"}}],
        "preguntas": [{"tipo": "transferencia", "valores": {"C1": "10n", "C2": "10n"}, "calcular": "V(o)/V(i)"}],
    })
    assert r["error"] is None
    assert r["incognitas"]["R"] == pytest.approx(1 / (2 * math.pi * 1e3 * 10e-9))
    t = r["preguntas"][0]["transferencia"]
    assert t["q"] == pytest.approx(0.5)
    assert r["verificacion"]["coincide"] is True


def test_funciones_de_s_como_preguntas_de_valor():
    r = resolver_planteamiento({
        "netlist": RC,
        "preguntas": [
            {"calcular": "H0(V(o)/V(i))"},
            {"calcular": "f0(V(o)/V(i))"},
            {"calcular": "db(V(o)/V(i), 1k)"},
            {"calcular": "fase(V(o)/V(i), 159.155)"},
        ],
    })
    valores = [p["valor"] for p in r["preguntas"]]
    assert valores[0] == pytest.approx(1)
    assert valores[1] == pytest.approx(159.155, rel=1e-4)
    assert valores[2] == pytest.approx(20 * math.log10(1 / math.sqrt(1 + (2 * math.pi * 1e3 * 1e-3) ** 2)), rel=1e-6)
    assert valores[3] == pytest.approx(-45, abs=0.01)
    assert all(p["coincide"] for p in r["verificacion"]["preguntas"])


def test_el_nodo_entrega_el_bode_como_curva_y_el_informe_la_transferencia():
    from agents.analisis.node import analisis_node

    outcome = {
        "mode": "analysis", "netlist": RC, "metodo": "completo", "terminales": None, "frecuencia_hz": None,
        "preguntas": [{"nombre": "H", "tipo": "transferencia", "valores": [], "calcular": "V(o)/V(i)"}],
    }
    actualizacion = analisis_node({"outcome": outcome})
    curva = actualizacion["sim_results"]["analisis"]
    assert curva["analysis_type"] == "ac" and curva["y_unit"] == "dB"
    assert len(curva["curve"]) >= 30
    informe = actualizacion["outcome"]["informe"]
    assert "pasa bajos" in informe
    assert "$$H(s) =" in informe
    assert "f_0" in informe and "159.2" in informe
    assert "coincide" in informe
