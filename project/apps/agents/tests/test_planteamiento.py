"""Planteamientos: incógnitas, escenarios con mediciones y preguntas.

Problemas del Franco resueltos a mano como referencia (no se copia el
enunciado, solo el circuito y los datos).
"""

import pytest

from agents.analisis.planteamiento import resolver_planteamiento

# P1.4: amplificador de transconductancia; Ri, Ag y Ro se deducen de dos
# mediciones con cargas distintas.
TRANSCONDUCTANCIA = """VS s 0 {vS}
RS s i 100k
RI i 0 {Ri}
GM 0 o i 0 {Ag}
RO o 0 {Ro}
RL o 0 {RL}
"""

P1_4 = {
    "netlist": TRANSCONDUCTANCIA,
    "incognitas": ["Ri", "Ag", "Ro"],
    "escenarios": [
        {"nombre": "RL = 40 Ω", "valores": {"vS": 0.150, "RL": 40}, "mediciones": {"V(i)": 0.125, "I(RL)": 0.230}},
        {"nombre": "RL = 60 Ω", "valores": {"vS": 0.150, "RL": 60}, "mediciones": {"V(i)": 0.125, "I(RL)": 0.220}},
    ],
    "preguntas": [
        {"nombre": "corriente de cortocircuito", "valores": {"vS": 0.100, "RL": 0}, "calcular": "I(RL)"},
    ],
}


def test_p1_4_deduce_los_parametros_del_amplificador_de_transconductancia():
    r = resolver_planteamiento(P1_4)

    assert r["error"] is None
    assert r["incognitas"]["Ri"] == pytest.approx(500e3)
    assert r["incognitas"]["Ag"] == pytest.approx(2.024)
    assert r["incognitas"]["Ro"] == pytest.approx(400)
    # 100 mV · 500k/600k · 2.024 A/V = 168.67 mA
    assert r["preguntas"][0]["valor"] == pytest.approx(0.1 * 5 / 6 * 2.024)


def test_p1_4_ngspice_reproduce_cada_medicion_con_lo_encontrado():
    r = resolver_planteamiento(P1_4)

    assert r["verificacion"]["coincide"] is True
    for escenario in r["verificacion"]["escenarios"]:
        assert escenario["coincide"] is True
    # y la pregunta, con la carga en corto, también se simula
    assert r["verificacion"]["preguntas"][0]["coincide"] is True
    assert r["verificacion"]["preguntas"][0]["ngspice"] == pytest.approx(0.1 * 5 / 6 * 2.024, rel=1e-4)


def test_p1_1_cuatro_incognitas_con_tres_escenarios():
    # Amplificador de tensión: fuente de 200 mV con Rs desconocida; se mide
    # con carga de 10 Ω, sin carga, y sin carga con 30 kΩ en la entrada.
    r = resolver_planteamiento({
        "netlist": "VS s 0 0.2\nRS s i {Rs}\nRI i 0 {Ri}\nRP i 0 {Rp}\nEA x 0 i 0 {Aoc}\nRO x o {Ro}\nRL o 0 {RL}\n",
        "incognitas": ["Rs", "Ri", "Aoc", "Ro"],
        "escenarios": [
            {"valores": {"RL": 10, "Rp": "inf"}, "mediciones": {"V(i)": 0.150, "V(o)": 10}},
            {"valores": {"RL": "inf", "Rp": "inf"}, "mediciones": {"V(o)": 12}},
            {"valores": {"RL": "inf", "Rp": "30k"}, "mediciones": {"V(o)": 9.6}},
        ],
    })

    assert r["error"] is None
    assert r["incognitas"] == pytest.approx({"Rs": 10e3, "Ri": 30e3, "Aoc": 80, "Ro": 2})
    assert r["verificacion"]["coincide"] is True


def test_faltan_mediciones_lo_dice_en_vez_de_adivinar():
    r = resolver_planteamiento({**P1_4, "escenarios": P1_4["escenarios"][:1], "preguntas": []})
    assert r["incognitas"] == {}
    assert "faltan datos" in r["error"]


def test_sin_incognitas_solo_responde_las_preguntas():
    # P1.11 con a = 100, 10⁴ y 10⁶: un barrido es una pregunta por valor.
    netlist = "VI i 0 0.1\nR1 i n 10k\nR2 n o 100k\nX1 0 n o OPAMP a={a}\n"
    r = resolver_planteamiento({
        "netlist": netlist,
        "preguntas": [{"valores": {"a": a}, "calcular": "V(o)"} for a in (1e2, 1e4, 1e6)],
    })
    assert r["error"] is None
    valores = [p["valor"] for p in r["preguntas"]]
    assert valores == pytest.approx([-1 / (1 + 11 / a) for a in (1e2, 1e4, 1e6)])
    assert all(p["coincide"] for p in r["verificacion"]["preguntas"])


def test_diseno_por_ecuaciones_con_potenciometro():
    # P1.9a: no inversor de ganancia 1..5 V/V con un pot de 100 k. Con el
    # cursor k del pot hacia la salida: A = 1 + k·100k / (R1 + (1-k)·100k)…
    # aquí la versión que se despeja: R1 en serie con la parte baja del pot.
    netlist = (
        "VI i 0 1\nX1 i n o OPAMP\n"
        "RA o n {k*100000}\nRB n m {(1-k)*100000}\nR1 m 0 {R1}\n"
    )
    r = resolver_planteamiento({
        "netlist": netlist,
        "incognitas": ["R1"],
        "escenarios": [{"valores": {"k": 1}, "mediciones": {"V(o)/V(i)": 5}}],
        "preguntas": [{"valores": {"k": 0}, "calcular": "V(o)/V(i)"}],
    })
    assert r["error"] is None
    assert r["incognitas"]["R1"] == pytest.approx(25e3)
    assert r["preguntas"][0]["valor"] == pytest.approx(1)


def test_una_expresion_que_no_existe_es_un_error_claro():
    r = resolver_planteamiento({**P1_4, "escenarios": [{"valores": {"vS": 0.15, "RL": 40}, "mediciones": {"V(zz)": 1}}]})
    assert "V(zz)" in r["error"]


# --- en el nodo analisis, con la forma que entrega el schema del orquestador -----------

from agents.analisis.node import analisis_node  # noqa: E402


def _como_schema(spec: dict) -> dict:
    """El planteamiento con listas de pares, como lo produce AnalysisOutcome."""
    pares = lambda d, k, v: [{k: a, v: str(b)} for a, b in (d or {}).items()]  # noqa: E731
    return {
        "mode": "analysis",
        "netlist": spec["netlist"],
        "metodo": "completo",
        "terminales": None,
        "frecuencia_hz": None,
        "incognitas": spec.get("incognitas"),
        "escenarios": [
            {"nombre": e.get("nombre"), "valores": pares(e.get("valores"), "simbolo", "valor"), "mediciones": pares(e.get("mediciones"), "expresion", "valor")}
            for e in spec.get("escenarios") or []
        ],
        "preguntas": [
            {"nombre": p.get("nombre"), "valores": pares(p.get("valores"), "simbolo", "valor"), "calcular": p["calcular"]}
            for p in spec.get("preguntas") or []
        ],
    }


def test_el_nodo_analisis_resuelve_un_planteamiento_y_lo_explica():
    actualizacion = analisis_node({"outcome": _como_schema(P1_4)})
    outcome = actualizacion["outcome"]

    assert outcome["error"] is None
    assert outcome["formato"] == "markdown"
    assert outcome["resultados"]["validacion"]["coincide"] is True
    informe = outcome["informe"]
    assert "## " in informe and "$$" in informe  # secciones y ecuaciones
    assert "500" in informe and "2.024" in informe and "400" in informe
    assert "168.7" in informe
    # el artefacto es el circuito con los valores encontrados, dibujable
    texto = actualizacion["netlists"]["analisis"]["text"]
    assert "{" not in texto
    assert "RI i 0 500k" in texto


def test_un_circuito_con_op_amp_sin_preguntas_da_las_tensiones_de_nodo():
    # P1.15: "find vN, vP y vO" — sin incógnitas ni preguntas explícitas.
    outcome = {
        "mode": "analysis",
        "netlist": "R1 n 0 10k\nV4 o n 4\nX1 p n o OPAMP\nR3 p 0 30k\nR2 p o 20k\n",
        "metodo": "completo", "terminales": None, "frecuencia_hz": None,
    }
    resultado = analisis_node({"outcome": outcome})["outcome"]
    assert resultado["error"] is None
    assert resultado["resultados"]["validacion"]["coincide"] is True
    assert "V(o)" in resultado["informe"] and "10" in resultado["informe"]


def test_una_red_pasiva_sigue_por_el_analisis_de_siempre():
    outcome = {"mode": "analysis", "netlist": "V1 a 0 10\nR1 a b 1k\nR2 b 0 1k\n", "metodo": "nodos", "terminales": None, "frecuencia_hz": None}
    resultado = analisis_node({"outcome": outcome})["outcome"]
    assert resultado.get("formato") != "markdown"
    assert "MÉTODO DE NODOS" in resultado["informe"]


def test_un_escenario_imposible_dice_cual_y_que_componente_quedo_en_corto():
    # Caso real (Franco P1.9 mal transcrito): la parte baja del pot quedó en
    # paralelo con R1; con k = 1 vale 0 Ω y pone la entrada inversora a tierra.
    r = resolver_planteamiento({
        "netlist": "X1 vin vminus vout OPAMP\nR1 vminus 0 {R1}\nRP1 vout vminus {k*100k}\nRP2 vminus 0 {(1-k)*100k}\nVS vin 0 1\n",
        "incognitas": ["R1"],
        "escenarios": [
            {"nombre": "Ganancia minima (k=0)", "valores": {"k": 0}, "mediciones": {"V(vout)/V(vin)": 1}},
            {"nombre": "Ganancia maxima (k=1)", "valores": {"k": 1}, "mediciones": {"V(vout)/V(vin)": 5}},
        ],
    })
    assert "Ganancia maxima (k=1)" in r["error"]
    assert "RP2" in r["error"] and "corto" in r["error"]
