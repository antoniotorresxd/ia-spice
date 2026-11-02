import pytest

from agents.evaluacion import analogcoder as ac

TAREAS = {t["tarea_original"]: t for t in ac.cargar_tareas()}


def test_se_toman_las_siete_tareas_a_nivel_tarjeta():
    assert sorted(TAREAS) == [16, 17, 18, 19, 20, 21, 22]


def test_el_prompt_solo_reproduce_los_reemplazos_de_analogcoder():
    prompt = ac.prompt_solo(TAREAS[18])

    assert "Design An Opamp integrator with resistor R1 and capacitor Cf." in prompt
    assert "Input node name: Vin." in prompt and "Output node name: Vout." in prompt
    # para tareas complejas se quita la regla de no usar subcircuitos
    assert "Avoid using subcircuits" not in prompt


def test_el_enunciado_del_sistema_es_la_pregunta_original():
    texto = ac.enunciado(TAREAS[20])

    assert texto.startswith("Design An Opamp adder to make Vout=-(Vin1+Vin2).")
    assert "Input node name: Vin1, Vin2." in texto


def test_extraer_codigo_toma_el_primer_bloque_y_corta_tras_el_simulador():
    respuesta = "plan\n```python\ncircuit = Circuit('x')\n\nsimulator = circuit.simulator()\nprint(1)\n```\n```python\notro\n```"

    codigo = ac.extraer_codigo(respuesta)

    assert codigo.startswith("from PySpice.Unit import *\nfrom PySpice.Spice.Netlist import Circuit\n")
    assert codigo.rstrip().endswith("simulator = circuit.simulator()")
    assert ac.extraer_codigo("sin código") == ""


def test_el_adaptador_conserva_el_subcircuito_y_quita_el_bloque_control():
    netlist = ("* titulo\nVin vin 0 DC 1\nR1 vin vout 1k\nX1 0 vout vout opamp\n"
               ".subckt opamp inp inn out\nEout out 0 inp inn 1e5\n.ends\n"
               ".control\nop\n.endc\n.end")

    codigo = ac.netlist_a_pyspice(netlist)

    assert ".subckt opamp" in codigo and ".ends" in codigo
    assert "op\\n" not in codigo.split("raw_spice")[0]
    assert "R1 vin vout 1k" in codigo


@pytest.mark.parametrize(("n", "c", "k", "esperado"), [(5, 0, 1, 0.0), (5, 5, 1, 1.0), (5, 2, 1, 0.4), (5, 1, 5, 1.0)])
def test_pass_at_k(n, c, k, esperado):
    assert ac.pass_at_k(n, c, k) == pytest.approx(esperado)


def test_una_respuesta_sin_codigo_se_clasifica_sin_codigo():
    assert ac.calificar("", TAREAS[18])["escalon"] == "sin_codigo"


@pytest.mark.parametrize("tarea", [18, 21])
def test_los_disenos_de_referencia_pasan_su_verificador(tarea):
    codigo = (ac.DIR / TAREAS[tarea]["referencia"]).read_text(encoding="utf-8")

    assert ac.calificar(codigo, TAREAS[tarea])["escalon"] == "pasa"


def test_un_circuito_equivocado_no_pasa():
    p21 = (ac.DIR / TAREAS[21]["referencia"]).read_text(encoding="utf-8")

    assert ac.calificar(p21, TAREAS[20])["paso"] is False
