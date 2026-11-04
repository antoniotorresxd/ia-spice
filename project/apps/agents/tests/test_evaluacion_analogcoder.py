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
    for indicacion in ac.INDICACIONES_COMUNES:
        assert indicacion in texto
        assert indicacion in ac.prompt_solo(TAREAS[20])  # la misma información que el LLM solo


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


def test_un_error_de_api_se_registra_aparte_y_detiene_el_experimento():
    def falla(t, k):
        raise RuntimeError("404 models/flash-3.8 is not found")

    with pytest.raises(SystemExit, match="id del modelo"):
        ac._correr([TAREAS[18]], 5, "prueba", falla)


def test_los_errores_de_api_no_cuentan_como_intentos():
    filas = [{"tarea": 18, "escalon": "error_api", "paso": False},
             {"tarea": 18, "escalon": "pasa", "paso": True}]

    assert "| 18 | Integrator | 1/1 |" in ac.resumir(filas, "x")


def test_openrouter_usa_la_api_compatible_con_openai(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-prueba")

    cfg = ac._config_llm("openrouter", "google/gemini-x")

    assert (cfg.provider, cfg.model, cfg.base_url) == ("openai_compatible", "google/gemini-x", ac.OPENROUTER_URL)


def test_sin_key_se_detiene_con_un_mensaje_claro(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(SystemExit, match="OPENROUTER_API_KEY"):
        ac._config_llm("openrouter", "google/gemini-x")


def test_acotar_fija_el_maximo_de_tokens_para_openrouter(monkeypatch):
    from agents.llm.factory import build_chat_model

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-prueba")
    llm = ac._acotar(build_chat_model(ac._config_llm("openrouter", "google/gemini-x")))

    assert llm.max_tokens == ac.MAX_TOKENS
    assert llm.extra_body["max_tokens"] == ac.MAX_TOKENS
    assert llm.max_retries == 2


def test_forzar_modelo_tambien_acota_los_agentes(monkeypatch):
    import agents.orquestador.node as orq

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-prueba")
    cfg = ac._config_llm("openrouter", "google/gemini-x")
    monkeypatch.setattr(orq, "fetch_agent_llm", orq.fetch_agent_llm)
    monkeypatch.setattr(orq, "build_chat_model", orq.build_chat_model)

    ac._forzar_modelo(cfg)

    llm = orq.build_chat_model(orq.fetch_agent_llm("x", "u"))
    assert llm.model_name == "google/gemini-x" and llm.max_tokens == ac.MAX_TOKENS


def test_un_sumador_referido_a_tierra_pasa_aunque_las_entradas_tengan_otro_valor_dc():
    """Regresión: el sesgo debe ser la tierra virtual del op-amp (0 V aquí),
    no el valor DC de la fuente de entrada (0.5 V)."""
    codigo = (
        "from PySpice.Spice.Netlist import Circuit\nfrom PySpice.Unit import *\n"
        "circuit = Circuit('sumador')\n"
        "circuit.V('in1', 'Vin1', circuit.gnd, 0.5)\ncircuit.V('in2', 'Vin2', circuit.gnd, 0.5)\n"
        "circuit.R('1', 'Vin1', 'Vsum', 10@u_kΩ)\ncircuit.R('2', 'Vin2', 'Vsum', 10@u_kΩ)\n"
        "circuit.R('f', 'Vout', 'Vsum', 10@u_kΩ)\n"
        "circuit.VCVS('Aop', 'Vout', circuit.gnd, circuit.gnd, 'Vsum', 1e6)\n"
        "simulator = circuit.simulator()\n")

    assert ac.calificar(codigo, TAREAS[20])["escalon"] == "pasa"


def test_sistema_responde_una_aclaracion_con_el_texto_fijo():
    from agents.evaluacion import analogcoder as ac

    class _Grafo:
        def __init__(self):
            self.pedidos = []

        def invoke(self, estado, config):
            self.pedidos.append(estado["request_text"])
            if len(self.pedidos) == 1:
                return {"outcome": {"mode": "clarify", "question": "¿Qué f_int?"}, "netlists": {}}
            return {"netlists": {"c": {"text": "* t\nR1 vin vout 1k\n.end\n"}}}

    tarea = ac.cargar_tareas([18])[0]
    grafo = _Grafo()
    texto, _ = ac.generar_sistema(tarea, grafo, "u", 1)

    assert len(grafo.pedidos) == 2
    assert grafo.pedidos[1].startswith(f"Usuario: {ac.enunciado(tarea)}")
    assert "Asistente: ¿Qué f_int?" in grafo.pedidos[1]
    assert grafo.pedidos[1].endswith(ac.RESPUESTA_ACLARACION)
    assert "R1 vin vout 1k" in texto


def test_sistema_aclara_una_sola_vez():
    from agents.evaluacion import analogcoder as ac

    class _Grafo:
        n = 0

        def invoke(self, estado, config):
            self.n += 1
            return {"outcome": {"mode": "clarify", "question": "?"}, "netlists": {}}

    grafo = _Grafo()
    texto, codigo = ac.generar_sistema(ac.cargar_tareas([22])[0], grafo, "u", 1)
    assert grafo.n == 2 and texto.startswith("sin netlist") and codigo == ""


# ---------------------------------------------------------------- verificador adaptado

_OPAMP = (".subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\n"
          "Cp n2 0 159n\nEout out 0 n2 0 1\n.ends\n")


@pytest.mark.parametrize("tarea_id", [16, 17, 18, 19, 20, 21, 22])
def test_las_referencias_pasan_con_el_verificador_adaptado(tarea_id):
    t = ac.cargar_tareas([tarea_id])[0]
    r = ac.calificar((ac.DIR / t["referencia"]).read_text(encoding="utf-8"), t, verificador="adaptado")
    assert r["escalon"] == "pasa", r["detalle"]


@pytest.mark.parametrize("tarea_id, netlist", [
    (16, "Vin vin 0 DC 0\nRin vin vminus 10k\nRf vminus vout 100k\nX1 0 vminus vout opamp\n"),  # no oscila
    (18, "Vin vin 0 DC 0\nR1 vin n 10k\nCf n 0 3u\nX1 n vout vout opamp\n"),  # RC pasivo + seguidor
    (19, "Vin vin 0 DC 0\nRf n 0 10k\nC1 vin n 3u\nX1 n vout vout opamp\n"),  # CR pasivo + seguidor
])
def test_el_verificador_adaptado_sigue_rechazando_circuitos_incorrectos(tarea_id, netlist):
    t = ac.cargar_tareas([tarea_id])[0]
    r = ac.calificar_ambos(ac.netlist_a_pyspice(netlist + _OPAMP), t)
    assert not r["paso"] and not r["paso_adaptado"]


def test_integrador_practico_con_rf_pasa_solo_con_el_adaptado():
    """Diseño correcto del catálogo (Rin renombrada a R1, Rf para la ganancia
    en continua): el original lo reprueba por la descarga inicial de Rf*Cf."""
    netlist = ("Vin vin 0 DC 0 AC 1\nR1 vin vminus 19340\nRf vminus vout 193406\n"
               "Cf vminus vout 1.2155e-08\nX1 0 vminus vout opamp\n" + _OPAMP)
    r = ac.calificar_ambos(ac.netlist_a_pyspice(netlist), ac.cargar_tareas([18])[0])
    assert r["escalon"] == "no_funciona" and r["escalon_adaptado"] == "pasa"


def test_oscilador_con_entrada_no_inversora_a_tierra_se_puede_calificar():
    """El original truena (IndexError: 0) al leer la entrada en tierra; el
    adaptado la omite y juzga la oscilación."""
    t = ac.cargar_tareas([16])[0]
    original = ac.armar_script("x", t)
    adaptado = ac.armar_script("x", t, "adaptado")
    assert "_tierra" not in original and "_tierra" in adaptado


def test_el_resumen_muestra_las_dos_columnas():
    filas = [{"tarea": 20, "tipo": "Adder", "escalon": "no_funciona", "paso": False,
              "escalon_adaptado": "pasa", "paso_adaptado": True}]
    texto = ac.resumir(filas, "x")
    assert "Pass@1 adapt." in texto and "| 0/1 | 0.0 |" in texto and "| 1/1 | 100.0 |" in texto
