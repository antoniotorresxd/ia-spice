import cmath
from unittest.mock import MagicMock

import pytest
import sympy as sp

import agents.orquestador.node as orquestador_module
from agents.analisis.ecuaciones import analisis_mallas, analisis_nodal
from agents.analisis.informe import analizar
from agents.analisis.red import RedInvalida, fmt, leer_red, valor_spice
from agents.analisis.reduccion import reducir
from agents.analisis.thevenin import impedancia_por_prueba, thevenin
from agents.graph import build_graph
from agents.orquestador.schema import AnalysisOutcome, OrchestratorResult

# Dos mallas con fuente de tensión, una fuente de corriente y una rama que
# cruza: lo bastante rica para que nodos y mallas no coincidan por casualidad.
RED = """* red de prueba
V1 1 0 12
R1 1 2 1k
R2 2 0 2k
R3 2 3 1k
R4 3 0 1k
I1 0 3 1m
R5 1 3 3k
"""

# Puente de Wheatstone desbalanceado: no se reduce solo con serie/paralelo.
PUENTE = """V1 s 0 10
RS s a 50
R1 a b 100
R2 a c 200
R3 b c 300
R4 b 0 400
R5 c 0 500
"""


def c(x) -> complex:
    return complex(sp.N(x))


# --- lectura -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("texto", "valor"),
    [("4.7k", 4700.0), ("10meg", 1e7), ("2.2uF", 2.2e-6), ("1e3", 1000.0), ("100n", 1e-7), ("3", 3.0)],
)
def test_valor_spice(texto, valor):
    assert valor_spice(texto) == pytest.approx(valor)


def test_leer_red_acepta_fuentes_con_dc_y_ac_y_omite_control():
    red = leer_red("* t\nV1 a 0 DC 5\nV2 b 0 AC 1\nR1 a b 1k\n.control\nop\n.endc\n.end\n")
    assert [(e.nombre, e.tipo, e.valor) for e in red] == [("V1", "V", 5.0), ("V2", "V", 1.0), ("R1", "R", 1000.0)]


@pytest.mark.parametrize(
    ("netlist", "mensaje"),
    [
        ("* t\nQ1 c b e NPN\nR1 c 0 1k\n", "solo se analizan"),
        ("R1 a b 1k\nR2 b a 2k\n", "nodo de referencia"),
        ("R1 a 0 1k\nR1 a 0 2k\n", "repetidos"),
        ("V1 a 0 5\nR1 a 0\n", "incompleta"),
    ],
)
def test_leer_red_rechaza_lo_que_no_es_una_red_lineal(netlist, mensaje):
    with pytest.raises(RedInvalida, match=mensaje):
        leer_red(netlist)


def test_fmt():
    assert fmt(2400, "Ω") == "2.4 kΩ"
    assert fmt(0.00125, "A") == "1.25 mA"
    assert fmt(3 - 3j, "V") == "4.243 V∠-45.0°"


# --- nodos y mallas ------------------------------------------------------------


def test_nodos_resuelve_la_red():
    s = analisis_nodal(leer_red(RED))

    assert c(s.tensiones["2"]).real == pytest.approx(6.8276, rel=1e-4)
    assert c(s.tensiones["3"]).real == pytest.approx(5.0690, rel=1e-4)
    # KCL en el nodo 2: lo que entra por R1 sale por R2 y R3.
    assert c(s.corrientes["R1"]) == pytest.approx(c(s.corrientes["R2"]) + c(s.corrientes["R3"]))


def test_mallas_y_nodos_dan_la_misma_respuesta():
    red = leer_red(RED)
    nodos, mallas = analisis_nodal(red), analisis_mallas(red)

    for n, v in nodos.tensiones.items():
        assert c(mallas.tensiones[n]) == pytest.approx(c(v))
    for nombre, i in nodos.corrientes.items():
        assert c(mallas.corrientes[nombre]) == pytest.approx(c(i)), nombre


def test_mallas_cuenta_una_malla_por_cara_interna():
    # Ramas - nodos + 1 = 7 - 4 + 1 = 4 mallas, y una ecuación más por la
    # fuente de corriente (la supermalla).
    mallas = analisis_mallas(leer_red(RED))
    assert len(mallas.notas) == 4
    assert len(mallas.ecuaciones) == 5


def test_mallas_rechaza_una_red_no_plana():
    # K3,3: tres nodos conectados con otros tres, todos con todos.
    lineas = ["V1 a 0 1"]
    for i, (x, y) in enumerate((x, y) for x in ("a", "b", "c") for y in ("x", "y", "0")):
        lineas.append(f"R{i} {x} {y} 1k")
    red = leer_red("\n".join(lineas))
    with pytest.raises(RedInvalida, match="no es plana"):
        analisis_mallas(red)
    analisis_nodal(red)  # nodos sí la resuelve


def test_un_nodo_flotante_es_un_sistema_singular():
    with pytest.raises(RedInvalida, match="singular"):
        analisis_nodal(leer_red("V1 a 0 5\nR1 a 0 1k\nI1 b c 1m\n"))


def test_ac_con_fasores():
    red = leer_red("V1 in 0 AC 10\nR1 in out 1k\nC1 out 0 159.155n\n")
    s = analisis_nodal(red, frecuencia=1000)

    v = c(s.tensiones["out"])
    assert abs(v) == pytest.approx(10 / 2**0.5, rel=1e-4)
    assert cmath.phase(v) == pytest.approx(-cmath.pi / 4, rel=1e-3)


# --- reducción y Thévenin ---------------------------------------------------------


def test_reduccion_serie_paralelo():
    r = reducir(leer_red("R1 a b 1k\nR2 b 0 2k\nR3 b 0 2k\n"), "a", "0")
    assert c(r.equivalente).real == pytest.approx(2000)
    assert any("∥" in p for p in r.pasos) and any("serie" in p for p in r.pasos)


def test_reduccion_de_un_puente_con_delta_estrella():
    red = leer_red(PUENTE)
    r = reducir(red, "a", "0")

    assert any("Δ→Y" in p for p in r.pasos)
    assert c(r.equivalente) == pytest.approx(c(impedancia_por_prueba(red, "a", "0", None)))


def test_reduccion_anula_las_fuentes():
    r = reducir(leer_red("V1 a 0 5\nR1 a b 1k\nR2 b 0 1k\nI1 b 0 1m\n"), "b", "0")
    assert c(r.equivalente).real == pytest.approx(500)
    assert any("corto" in p for p in r.pasos) and any("abierto" in p for p in r.pasos)


def test_reduccion_dc_con_inductor_y_capacitor():
    # En DC: L en corto, C abierto.
    r = reducir(leer_red("R1 a b 1k\nL1 b c 1m\nR2 c 0 1k\nC1 a 0 1u\n"), "a", "0")
    assert c(r.equivalente).real == pytest.approx(2000)


def test_thevenin_divisor():
    th = thevenin(leer_red("V1 a 0 12\nR1 a b 1k\nR2 b 0 3k\n"), "b", "0")
    assert c(th.vth).real == pytest.approx(9.0)
    assert c(th.zth).real == pytest.approx(750.0)
    assert c(th.norton).real == pytest.approx(0.012)


# --- informe y verificación con ngspice --------------------------------------------


def test_analizar_completo_verifica_con_ngspice():
    r = analizar({"netlist": RED, "terminales": ["3", "0"]})

    assert r["error"] is None
    assert r["resultados"]["validacion"]["coincide"] is True
    assert r["resultados"]["mallas_coincide_con_nodos"] is True
    assert r["resultados"]["thevenin"]["vth"] == pytest.approx(5.069, rel=1e-3)
    for seccion in ("MÉTODO DE NODOS", "MÉTODO DE MALLAS", "REDUCCIÓN", "EQUIVALENTES", "NGSPICE"):
        assert seccion in r["informe"]


def test_analizar_ac_verifica_con_ngspice():
    r = analizar({"netlist": "V1 in 0 AC 10\nR1 in out 1k\nC1 out 0 159.155n\n", "frecuencia_hz": 1000})
    assert r["resultados"]["validacion"]["coincide"] is True


def test_analizar_un_solo_metodo():
    r = analizar({"netlist": RED, "metodo": "mallas"})
    assert "MÉTODO DE MALLAS" in r["informe"]
    assert "MÉTODO DE NODOS" not in r["informe"]


def test_analizar_nunca_lanza():
    r = analizar({"netlist": "Q1 a b c NPN\nR1 a 0 1k\n"})
    assert r["error"]
    assert "No se pudo leer la red" in r["informe"]


def test_reduccion_sin_terminales_lo_dice():
    r = analizar({"netlist": RED, "metodo": "reduccion"})
    assert "terminales" in r["error"]


# --- verificación de Z_eq con fuente de prueba -------------------------------------

# Caso real: el LLM transcribió la fuente de prueba de nodo_in a tierra y dejó
# nodo_out al aire. No circula corriente: todos los nodos quedan en 1 V y
# comparar tensiones "coincide" sin probar nada. Lo que hay que verificar es
# la Z_eq entre los terminales.
RED_SERIE_PARALELO = """* Analisis de red
R1 nodo_in nA 100
R2 nA nC 50
R3 nA nC 200
R4 nC nB 250
R5 nA nD 10
R6 nD nB 30
R7 nB nodo_out 120
VTEST nodo_in 0 DC 1
"""
REQ_SERIE_PARALELO = 100 + 1 / (1 / (40 + 250) + 1 / (10 + 30)) + 120  # 255.15 Ω


def test_la_reduccion_se_verifica_con_una_fuente_de_prueba_entre_los_terminales():
    r = analizar({"netlist": RED_SERIE_PARALELO, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]})

    zeq = r["resultados"]["validacion"]["zeq"]
    assert zeq["ngspice"] == pytest.approx(REQ_SERIE_PARALELO, rel=1e-4)
    assert zeq["coincide"] is True
    assert r["resultados"]["validacion"]["coincide"] is True
    assert "VPRUEBA nodo_in nodo_out DC 1" in r["netlist_zeq"]
    assert "fuente de prueba de 1 V entre nodo_in y nodo_out" in r["informe"]


def test_una_red_sin_corriente_no_cuenta_como_verificada_por_sus_tensiones():
    r = analizar({"netlist": RED_SERIE_PARALELO, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]})

    assert r["resultados"]["validacion"]["sin_corriente"] is True
    assert "no circula corriente" in r["informe"]
    assert "las tensiones de nodo coinciden" not in r["informe"]

    # Sin terminales no queda nada que verificar: no se da por confirmada.
    sin_terminales = analizar({"netlist": "V1 a 0 5\nR1 a b 1k\n", "metodo": "nodos"})
    assert sin_terminales["resultados"]["validacion"]["sin_corriente"] is True
    assert sin_terminales["resultados"]["validacion"]["coincide"] is False


def test_si_ngspice_da_otra_zeq_no_coincide(monkeypatch):
    import agents.analisis.informe as informe

    monkeypatch.setattr(informe, "impedancia_con_ngspice", lambda *a, **k: ("* red", 300.0, None))
    r = analizar({"netlist": RED_SERIE_PARALELO, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]})

    assert r["resultados"]["validacion"]["zeq"]["coincide"] is False
    assert r["resultados"]["validacion"]["coincide"] is False
    assert "NO coincide" in r["informe"]


def test_thevenin_ac_verifica_la_impedancia_compleja():
    r = analizar({
        "netlist": "V1 in 0 AC 10\nR1 in out 1k\nC1 out 0 159.155n\n",
        "metodo": "thevenin",
        "terminales": ["out", "0"],
        "frecuencia_hz": 1000,
    })
    zeq = r["resultados"]["validacion"]["zeq"]
    # R ∥ C a la frecuencia de corte: 500 - 500j Ω
    assert zeq["ngspice"]["real"] == pytest.approx(500, rel=1e-3)
    assert zeq["ngspice"]["imag"] == pytest.approx(-500, rel=1e-3)
    assert zeq["coincide"] is True


# La misma red tal como debe transcribirla el LLM: pasiva, de dos terminales,
# sin fuente y sin nodo 0.
RED_PASIVA_SIN_TIERRA = """R1 nodo_in nA 100
R2 nA nC 50
R3 nA nC 200
R4 nC nB 250
R5 nA nD 10
R6 nD nB 30
R7 nB nodo_out 120
"""


def test_una_red_sin_nodo_0_toma_el_segundo_terminal_como_referencia():
    r = analizar({"netlist": RED_PASIVA_SIN_TIERRA, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]})

    assert r["error"] is None
    assert r["resultados"]["reduccion"]["equivalente"] == pytest.approx(REQ_SERIE_PARALELO)
    assert r["resultados"]["validacion"]["zeq"]["coincide"] is True
    assert r["resultados"]["validacion"]["coincide"] is True
    # El paso del paralelo sigue en el desglose y los terminales conservan su nombre.
    assert "R2 ∥ R3" in r["informe"]
    assert "REDUCCIÓN ENTRE nodo_in Y nodo_out" in r["informe"]
    assert "Z_eq(nodo_in, nodo_out)" in r["informe"]
    assert "se toma nodo_out como referencia (0)" in r["informe"]
    # ngspice necesita un nodo 0: el terminal de referencia lo es en su netlist.
    assert "VPRUEBA nodo_in 0 DC 1" in r["netlist_zeq"]


def test_sin_nodo_0_ni_terminales_sigue_siendo_un_error():
    r = analizar({"netlist": RED_PASIVA_SIN_TIERRA, "metodo": "nodos"})
    assert "nodo de referencia" in r["error"]


def test_una_red_sin_fuentes_no_sugiere_un_terminal_al_aire():
    r = analizar({"netlist": RED_PASIVA_SIN_TIERRA, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]})

    assert "al aire" not in r["informe"]
    assert "no tiene fuentes independientes" in r["informe"]


def test_el_nodo_guarda_el_netlist_de_la_prueba_como_artefacto():
    from agents.analisis.node import analisis_node

    outcome = {"mode": "analysis", "netlist": RED_SERIE_PARALELO, "metodo": "reduccion", "terminales": ["nodo_in", "nodo_out"]}
    actualizacion = analisis_node({"outcome": outcome})

    assert set(actualizacion["netlists"]) == {"analisis", "analisis_zeq"}
    assert "VPRUEBA" in actualizacion["netlists"]["analisis_zeq"]["text"]


# --- en el grafo -------------------------------------------------------------------


def test_el_orquestador_deriva_al_analisis(monkeypatch):
    analisis = AnalysisOutcome(mode="analysis", netlist=PUENTE, metodo="completo", terminales=["a", "0"])
    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module, "extract_orchestrator_outcome", lambda chat_model, text: analisis
    )
    estado = {
        "circuit_spec": {},
        "request_text": "resuelve este puente por mallas y saca el Thévenin entre a y tierra",
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
        "documentation": {},
        "outcome": None,
    }

    final = build_graph().invoke(
        estado, {"configurable": {"thread_id": "analisis-e2e", "user_id": "u"}}
    )

    assert final["outcome"]["mode"] == "analysis"
    assert final["outcome"]["error"] is None
    assert final["outcome"]["resultados"]["validacion"]["coincide"] is True
    assert "Δ→Y" in final["outcome"]["informe"]
    assert "analisis" in final["netlists"]
    assert final["verdict"] is None  # no hubo diseño que aceptar o rechazar


def test_el_schema_del_orquestador_acepta_el_modo_analisis():
    r = OrchestratorResult.model_validate(
        {"outcome": {"mode": "analysis", "netlist": "V1 a 0 1\nR1 a 0 1k", "terminales": ["a", "0"]}}
    )
    assert r.outcome.metodo == "completo"
