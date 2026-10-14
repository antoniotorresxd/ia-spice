import math

import pytest
import yaml

from agents.comerciales import (
    clasificar,
    comentarios_materiales,
    comercializar,
    config_comerciales,
    forzar_avance,
    insertar_comentarios,
)
from agents.comerciales.series import (
    E12,
    E24,
    E48,
    E96,
    formatear,
    mas_cercano,
    mejor_combinacion,
    minimo_no_menor,
    paso,
)
from agents.config import load_config, reset_config_cache
from agents.graph import build_graph

HABILITADO = {"comerciales": {"habilitado": True}}
SIN_COMBINAR = {"comerciales": {"habilitado": True, "combinar_resistencias": False}}


def _en_serie(valor: float, serie: tuple[float, ...]) -> bool:
    mantisa = valor / 10 ** math.floor(math.log10(valor))
    return any(math.isclose(mantisa, m, rel_tol=1e-9) for m in serie)


# --- series ---------------------------------------------------------------


def test_las_series_tienen_el_tamano_de_la_norma():
    assert (len(E12), len(E24), len(E48), len(E96)) == (12, 24, 48, 96)


@pytest.mark.parametrize(
    ("valor", "serie", "esperado"),
    [
        (34_400, "E24", 33_000),
        (34_400, "E12", 33_000),
        (34_400, "E96", 34_800),
        (9_600, "E24", 10_000),  # cruza de década
        (1.5915494309189535e-07, "E12", 150e-9),
        (0.47, "E12", 0.47),
    ],
)
def test_mas_cercano(valor, serie, esperado):
    assert mas_cercano(valor, serie) == pytest.approx(esperado)


def test_mas_cercano_no_deja_colas_binarias():
    # El valor termina tal cual en el netlist y en la lista de materiales.
    assert mas_cercano(34_400, "E24") == 33000.0
    assert repr(mas_cercano(5_100, "E24")) == "5100.0"


def test_mas_cercano_rechaza_valores_no_positivos():
    with pytest.raises(ValueError):
        mas_cercano(0, "E24")


def test_serie_desconocida():
    with pytest.raises(ValueError, match="serie desconocida"):
        mas_cercano(1000, "E7")


def test_paso_a_los_vecinos():
    assert paso(33_000, "E24", 1) == 36_000
    assert paso(10_000, "E24", -1) == 9_100
    assert paso(9_100, "E24", 1) == 10_000


def test_minimo_no_menor_redondea_hacia_arriba():
    assert minimo_no_menor(13e-6, "E12") == pytest.approx(15e-6)  # el cercano sería 12 µ
    assert minimo_no_menor(10e-6, "E12") == pytest.approx(10e-6)


@pytest.mark.parametrize("valor", [34_400, 1_941.18, 7_142.86, 123.4, 2.2e6 * 1.07])
def test_la_combinacion_queda_dentro_del_uno_por_ciento(valor):
    realizacion, partes, equivalente = mejor_combinacion(valor, "E24")
    assert realizacion in ("serie", "paralelo")
    assert all(_en_serie(p, E24) for p in partes)
    assert abs(equivalente - valor) / valor < 0.01
    if realizacion == "serie":
        assert equivalente == pytest.approx(sum(partes))
    else:
        assert equivalente == pytest.approx(1 / sum(1 / p for p in partes))


def test_formatear():
    assert formatear(33_000, "ohm") == "33kohm"
    assert formatear(150e-9, "F") == "150nF"
    assert formatear(4.7e-6, "F") == "4.7uF"
    assert formatear(1e6, "ohm") == "1Mohm"
    assert formatear(0.5, "ohm") == "0.5ohm"  # no "500mohm"


# --- comercializar --------------------------------------------------------


def test_clasificar_por_convencion_de_nombres():
    assert clasificar("RB1")[0] == "resistencia"
    assert clasificar("Cf")[0] == "capacitor"
    assert clasificar("L1")[0] == "inductor"
    for no_componente in ("VCC", "Vbias", "beta", "freq", "f_c", "tstep", "rl"):
        assert clasificar(no_componente) is None


def test_comercializar_solo_toca_componentes():
    valores = {"VCC": 12.0, "RC": 2_400.0, "RE": 612.0, "beta": 100.0, "freq": 1000.0}

    simulados, materiales = comercializar(valores, None, SIN_COMBINAR)

    assert simulados == {"VCC": 12.0, "RC": 2_400.0, "RE": 620.0, "beta": 100.0, "freq": 1000.0}
    assert [m["nombre"] for m in materiales] == ["RC", "RE"]
    assert valores["RE"] == 612.0  # no muta la entrada


def test_comercializar_respeta_lo_que_dio_el_usuario():
    simulados, materiales = comercializar({"RL": 4_321.0, "R": 999.0}, {"r_l": 4_321.0}, HABILITADO)

    assert simulados["RL"] == 4_321.0
    assert [m["nombre"] for m in materiales] == ["R"]


def test_comercializar_ignora_ceros_y_no_numericos():
    simulados, materiales = comercializar({"Rf": 0.0, "Rx": "abc"}, None, HABILITADO)

    assert simulados == {"Rf": 0.0, "Rx": "abc"}
    assert materiales == []


def test_comercializar_combina_resistencias_cuando_la_serie_se_queda_corta():
    simulados, materiales = comercializar({"R2": 34_400.0}, None, HABILITADO)

    (r2,) = materiales
    assert r2["realizacion"] in ("serie", "paralelo")
    assert abs(r2["error_pct"]) < 1
    assert simulados["R2"] == r2["valor"]


def test_comercializar_no_combina_si_el_valor_simple_ya_basta():
    _, (r,) = comercializar({"R": 10_050.0}, None, HABILITADO)  # 10k: -0.5 %

    assert r["realizacion"] == "simple"
    assert r["partes"] == [10_000.0]


def test_las_cotas_inferiores_se_redondean_hacia_arriba():
    simulados, (ce,) = comercializar({"CE": 13e-6}, None, HABILITADO, minimos={"CE"})

    assert simulados["CE"] == pytest.approx(15e-6)
    assert ce["error_pct"] > 0


def test_deshabilitado_devuelve_los_valores_tal_cual():
    simulados, materiales = comercializar({"R": 34_400.0}, None, {"comerciales": {"habilitado": False}})

    assert simulados == {"R": 34_400.0}
    assert materiales == []


def test_una_config_sin_la_seccion_queda_deshabilitada():
    # Configs de experimentos anteriores a este paso no cambian de resultado.
    assert config_comerciales({"curador": {}})["habilitado"] is False


def test_la_config_del_repo_lo_habilita():
    opciones = config_comerciales(load_config())
    assert opciones["habilitado"] is True
    assert opciones["serie_resistencias"] == "E24"


# --- forzar_avance --------------------------------------------------------


def test_forzar_avance_salta_al_vecino_si_el_ajuste_no_cambia_el_valor_comercial():
    # 33.5k y 33.6k caen ambos en 33k: sin el salto se volvería a simular lo mismo.
    assert forzar_avance({"R2": 33_600.0}, {"R2": 33_500.0}, None, SIN_COMBINAR) == {"R2": 36_000.0}
    assert forzar_avance({"R2": 33_400.0}, {"R2": 33_500.0}, None, SIN_COMBINAR) == {"R2": 30_000.0}


def test_forzar_avance_no_interviene_si_el_valor_comercial_ya_cambia():
    assert forzar_avance({"R2": 40_000.0}, {"R2": 33_000.0}, None, SIN_COMBINAR) == {"R2": 40_000.0}


def test_forzar_avance_deja_quieto_lo_que_no_se_ajusto():
    nuevos = {"R1": 10_000.0, "R2": 33_600.0, "VCC": 12.0}
    anteriores = {"R1": 10_000.0, "R2": 33_500.0, "VCC": 12.0}

    resultado = forzar_avance(nuevos, anteriores, None, SIN_COMBINAR)

    assert resultado == {"R1": 10_000.0, "R2": 36_000.0, "VCC": 12.0}


# --- comentarios en el netlist ---------------------------------------------


def test_los_comentarios_van_despues_del_titulo():
    _, materiales = comercializar({"R2": 34_400.0, "C": 13e-9}, None, HABILITADO)
    netlist = "* Divisor\nR1 vin vout 1k\n.end\n"

    resultado = insertar_comentarios(netlist, comentarios_materiales(materiales, "div1"))
    lineas = resultado.splitlines()

    assert lineas[0] == "* Divisor"
    assert lineas[1].startswith("* Valores comerciales (bloque div1)")
    assert all(linea.startswith("*") for linea in lineas[1:4])
    assert lineas[-2:] == ["R1 vin vout 1k", ".end"]


def test_sin_materiales_el_netlist_no_cambia():
    assert insertar_comentarios("* t\nR1 a 0 1k\n", []) == "* t\nR1 a 0 1k\n"


# --- de punta a punta, contra ngspice real ----------------------------------


def _estado_inicial(spec):
    return {
        "circuit_spec": spec,
        "request_text": None,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "commercial_values": {},
        "bom": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
        "documentation": {},
        "outcome": None,
    }


def _divisor(tolerance: float) -> dict:
    # R2 = 10k·5/7 = 7.14k: no existe en E24 (6.8k da -4.8 %, 7.5k da +5 %).
    return {
        "blocks": [
            {
                "id": "div1",
                "type": "catalog",
                "params": {
                    "circuit_id": "voltage_divider",
                    "params": {"v_in": 12.0, "v_out": 5.0, "r1": 10_000.0},
                    "requirements": [{"measure": "v_out", "value": 5.0}],
                },
            }
        ],
        "tolerance": tolerance,
    }


@pytest.fixture
def config_con(tmp_path, monkeypatch):
    def _aplicar(**comerciales):
        cfg = load_config()
        cfg["comerciales"] = {**cfg["comerciales"], **comerciales}
        ruta = tmp_path / "curador.yaml"
        ruta.write_text(yaml.safe_dump(cfg))
        monkeypatch.setenv("CURADOR_CONFIG_PATH", str(ruta))
        reset_config_cache()

    yield _aplicar
    reset_config_cache()


def test_el_grafo_simula_y_entrega_valores_comerciales():
    final = build_graph().invoke(
        _estado_inicial(_divisor(0.01)), {"configurable": {"thread_id": "comerciales-e2e"}}
    )

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(5.0, rel=0.01)
    # El valor continuo se conserva aparte del que se simuló.
    assert final["component_values"]["div1"]["R2"] == pytest.approx(7_142.86, rel=1e-4)
    r2 = next(m for m in final["bom"]["div1"] if m["nombre"] == "R2")
    assert r2["realizacion"] in ("serie", "paralelo")
    assert all(_en_serie(p, E24) for p in r2["partes"])
    assert final["commercial_values"]["div1"]["R2"] == r2["valor"]
    assert "Valores comerciales" in final["netlists"]["div1"]["text"]
    assert final["history"][-1]["commercial_values"]["div1"]["R2"] == r2["valor"]


def test_solo_con_e24_simple_el_lazo_recorre_valores_de_la_serie(config_con):
    config_con(combinar_resistencias=False)

    final = build_graph().invoke(
        _estado_inicial(_divisor(0.05)), {"configurable": {"thread_id": "comerciales-e24"}}
    )

    simulados = [r["commercial_values"]["div1"]["R2"] for r in final["history"]]
    assert all(_en_serie(r2, E24) for r2 in simulados)
    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(5.0, rel=0.05)


def test_los_capacitores_se_combinan_en_paralelo():
    # En capacitores la suma es la conexión en paralelo, al revés que en R.
    simulados, (c,) = comercializar({"C": 159.15e-9}, None, HABILITADO)

    assert c["realizacion"] == "paralelo"
    assert sum(c["partes"]) == pytest.approx(c["valor"])
    assert abs(c["error_pct"]) < 1
    assert simulados["C"] == c["valor"]


def test_los_inductores_se_combinan_en_serie():
    _, (bobina,) = comercializar({"L": 25.33e-3}, None, HABILITADO)

    assert bobina["realizacion"] == "serie"
    assert sum(bobina["partes"]) == pytest.approx(bobina["valor"])


def test_la_lista_de_materiales_omite_lo_que_la_plantilla_no_usa():
    _, materiales = comercializar(
        {"R1": 10_000.0, "Rg": 10_000.0}, None, HABILITADO, usados={"r1"}
    )

    assert [m["nombre"] for m in materiales] == ["R1"]


# --- escalamiento de precisión -----------------------------------------------


def test_el_escalamiento_se_acumula_por_nivel():
    cfg = {
        "comerciales": {
            "combinar_resistencias": False,
            "serie_resistencias": "E12",
            "escalamiento": [
                {"combinar_resistencias": True},
                {"serie_resistencias": "E96"},
            ],
        }
    }

    assert config_comerciales(cfg, 0)["combinar_resistencias"] is False
    assert config_comerciales(cfg, 1)["combinar_resistencias"] is True
    assert config_comerciales(cfg, 1)["serie_resistencias"] == "E12"
    nivel_2 = config_comerciales(cfg, 2)
    assert (nivel_2["combinar_resistencias"], nivel_2["serie_resistencias"]) == (True, "E96")
    assert nivel_2["niveles"] == 2


def test_ciclo_comercial_compara_solo_las_piezas():
    from agents.comerciales import ciclo_comercial

    actual = {"Rf": 8_200.0, "Rg": 1_000.0, "v_in": 0.5}
    assert ciclo_comercial(actual, [{"Rf": 8_200.0, "Rg": 1_000.0, "v_in": 0.7}])
    assert not ciclo_comercial(actual, [{"Rf": 10_000.0, "Rg": 1_000.0}])
    assert not ciclo_comercial(actual, [None])
    assert not ciclo_comercial({"v_in": 0.5}, [{"v_in": 0.5}])  # sin piezas no hay ciclo


def test_el_lazo_que_oscila_entre_valores_e12_escala_la_precision(config_con):
    # Rf = 9 k en E12: 8.2 k da -8 % y 10 k da +10 %, los dos fuera del 5 %.
    config_con(combinar_resistencias=False, serie_resistencias="E12")
    spec = {
        "blocks": [
            {
                "id": "amp1",
                "type": "catalog",
                "params": {
                    "circuit_id": "opamp_noninverting_amp",
                    "params": {"v_in": 0.5, "v_out": 5.0},
                    "requirements": [{"measure": "v_out", "value": 5.0}],
                },
            }
        ]
    }

    final = build_graph().invoke(_estado_inicial(spec), {"configurable": {"thread_id": "escala"}})

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["amp1"]["metrics"]["v_out"] == pytest.approx(5.0, rel=0.05)
    assert final["precision"]["amp1"] >= 1
    rf = next(m for m in final["bom"]["amp1"] if m["nombre"] == "Rf")
    assert rf["realizacion"] in ("serie", "paralelo")
