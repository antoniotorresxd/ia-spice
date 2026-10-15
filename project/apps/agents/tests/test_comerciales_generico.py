"""Valores comerciales en bloques `generic` (netlist escrito por el LLM).

Caso real, Franco: "Using standard 5% resistances, design a circuit such
that vO = -2(3v1 + 4v2 + 2v3)". El bloque era genérico y sus resistencias
nunca se llevaban a una serie: 600k pasó tal cual (no existe en E24). La
serie la fija el enunciado; si no dice, E24.
"""

import pytest

from agents.comerciales import con_serie_pedida, config_comerciales
from agents.comerciales.generico import comercializar_generico, componentes
from agents.config import get_config
from agents.graph import build_graph
from agents.orquestador.schema import CircuitSpec

OPAMP = """.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends
.control
op
wrdata output.txt v(vout)
.endc
.end"""


def _sumador(r1, r2, r3, rf):
    return (
        "* Weighted Inverting Summing Amplifier\nV1 v1 0 DC 1\nV2 v2 0 DC 1\nV3 v3 0 DC 1\n"
        f"R1 v1 vminus {r1}\nR2 v2 vminus {r2}\nR3 v3 vminus {r3}\nRf vminus vout {rf}\n"
        "X1 0 vminus vout opamp\n" + OPAMP
    )


def _valores(netlist: str) -> dict[str, float]:
    return {n: v for n, (_, v) in componentes(netlist).items()}


def test_el_macromodelo_del_opamp_no_es_una_pieza_que_se_compre():
    assert set(_valores(_sumador("100k", "75k", "150k", "600k"))) == {"R1", "R2", "R3", "Rf"}


def test_sin_serie_pedida_se_usa_e24():
    netlist, materiales = comercializar_generico(_sumador("100k", "75k", "150k", "600k"), get_config())

    assert {m["serie"] for m in materiales} == {"E24"}
    rf = next(m for m in materiales if m["nombre"] == "Rf")
    # 600k no está en E24: se arma con dos piezas de la serie
    assert rf["realizacion"] == "serie" and abs(rf["error_pct"]) < 1
    # el macromodelo queda intacto
    assert "Rin inp inn 1e6" in netlist and "Cp n2 0 159n" in netlist


def test_valores_ya_en_la_serie_no_se_tocan():
    netlist, materiales = comercializar_generico(_sumador("20k", "15k", "30k", "120k"), get_config())

    assert _valores(netlist) == pytest.approx({"R1": 20e3, "R2": 15e3, "R3": 30e3, "Rf": 120e3})
    assert all(m["error_pct"] == 0 and m["realizacion"] == "simple" for m in materiales)


def test_la_serie_que_pide_el_enunciado_reemplaza_a_la_de_la_config():
    cfg = con_serie_pedida(get_config(), "E12")
    _, materiales = comercializar_generico(_sumador("20k", "15k", "30k", "120k"), cfg)

    assert {m["serie"] for m in materiales} == {"E12"}
    # 20k y 30k no existen en E12
    assert {m["nombre"] for m in materiales if m["error_pct"] != 0 or m["realizacion"] != "simple"} >= {"R1", "R3"}


def test_una_serie_pedida_no_se_escala_a_otra():
    cfg = con_serie_pedida(get_config(), "E24")
    for nivel in range(config_comerciales(cfg)["niveles"] + 1):
        assert config_comerciales(cfg, nivel)["serie_resistencias"] == "E24"


def test_el_spec_distingue_la_serie_de_la_tolerancia_del_diseno():
    spec = CircuitSpec.model_validate({
        "blocks": [{"id": "s", "type": "generic", "params": {
            "description": "sumador", "netlist": _sumador("20k", "15k", "30k", "120k"),
            "requirements": [{"measure": "dc", "value": -18, "node": ""}]}}],
        "serie_resistencias": "E24",
    })
    assert spec.serie_resistencias == "E24"


def test_el_grafo_simula_el_bloque_generico_con_valores_comerciales():
    spec = {
        "blocks": [{
            "id": "sumador", "type": "generic",
            "params": {"description": "sumador ponderado", "netlist": _sumador("20k", "15k", "30k", "120k"),
                       "requirements": [{"measure": "dc", "value": -18, "node": ""}]},
        }],
        "serie_resistencias": "E24",
    }
    final = build_graph().invoke(
        {"circuit_spec": spec, "normalized_spec": None, "pending_blocks": None, "component_values": {}, "netlists": {},
         "sim_results": {}, "iteration": 0, "history": [], "verdict": None, "documentation": {}, "outcome": None},
        {"configurable": {"thread_id": "generico-e24"}},
    )

    assert final["normalized_spec"]["blocks"][0]["serie_resistencias"] == "E24"
    assert {m["serie"] for m in final["bom"]["sumador"] if m.get("serie")} == {"E24"}
    assert final["verdict"]["status"] == "accepted", (final["verdict"], final["sim_results"])
