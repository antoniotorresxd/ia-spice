"""Topologías del catálogo: paridad servidor/agentes, solvers y lazo completo."""

import math
import re
from pathlib import Path

import pytest

from agents.calculo.catalog_solver import CATALOG_SOLVERS, solve_catalog_circuit
from agents.graph import build_graph
from agents.knowledge.circuit_client import FALLBACK_CIRCUITS

SEED_TS = Path(__file__).resolve().parents[2] / "server/src/modules/circuit/circuit.services.ts"


def _seed_del_servidor() -> dict[str, str]:
    texto = SEED_TS.read_text(encoding="utf-8")
    return {
        cid: plantilla.strip()
        for cid, plantilla in re.findall(r'id: "([a-z_0-9]+)".*?spiceTemplate: `(.*?)`', texto, re.S)
    }


@pytest.mark.skipif(not SEED_TS.exists(), reason="el seed del servidor no está en este checkout")
def test_el_catalogo_de_respaldo_es_el_mismo_que_siembra_el_servidor():
    """Las dos copias del catálogo deben coincidir.

    En producción el agente lee las plantillas de la base (sembrada desde el
    TS); en las pruebas y sin servidor, de FALLBACK_CIRCUITS. Si divergen, lo
    que se prueba aquí no es lo que corre allá.
    """
    servidor = _seed_del_servidor()
    respaldo = {c.id: c.spiceTemplate.strip() for c in FALLBACK_CIRCUITS}

    assert set(servidor) == set(respaldo)
    for cid, plantilla in servidor.items():
        assert plantilla == respaldo[cid], f"la plantilla de {cid} difiere"


def test_toda_topologia_del_catalogo_tiene_solver():
    assert {c.id for c in FALLBACK_CIRCUITS} <= set(CATALOG_SOLVERS)


def _marcadores(plantilla: str) -> set[str]:
    return {m.lower().replace("_", "") for m in re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", plantilla)}


@pytest.mark.parametrize(
    ("circuit_id", "params"),
    [
        ("opamp_inverting_amp", {"v_in": 0.5, "v_out": -5.0}),
        ("opamp_difference_amp", {"gain": 4.7}),
        ("opamp_instrumentation_amp", {"gain": 100}),
        ("rlc_series_bandpass", {"f_0": 10_000, "q": 10}),
        ("rlc_parallel_tank", {"f_0": 455_000, "q": 20}),
    ],
)
def test_el_solver_cubre_todos_los_marcadores_de_la_plantilla(circuit_id, params):
    plantilla = next(c.spiceTemplate for c in FALLBACK_CIRCUITS if c.id == circuit_id)
    valores = solve_catalog_circuit(circuit_id, params)

    claves = {k.lower().replace("_", "") for k in valores} | {
        k.lower().replace("_", "") for k in params
    }
    assert _marcadores(plantilla) <= claves


def test_inversor():
    v = solve_catalog_circuit("opamp_inverting_amp", {"v_in": 0.5, "v_out": -5.0})
    assert v["Rf"] / v["Rin"] == pytest.approx(10.0)


def test_instrumentacion_g_igual_a_uno_deja_rg_abierta():
    v = solve_catalog_circuit("opamp_instrumentation_amp", {"gain": 1})
    assert 1 + 2 * v["R"] / v["RG"] == pytest.approx(1.0, abs=1e-4)


def test_instrumentacion():
    v = solve_catalog_circuit("opamp_instrumentation_amp", {"gain": 101, "r": 10_000})
    assert v["RG"] == pytest.approx(200.0)
    assert v["Vp"] - v["Vn"] == pytest.approx(0.01)


def test_rlc_serie():
    v = solve_catalog_circuit("rlc_series_bandpass", {"f_0": 10_000, "q": 10, "c": 10e-9})
    assert 1 / (2 * math.pi * math.sqrt(v["L"] * v["C"])) == pytest.approx(10_000)
    assert math.sqrt(v["L"] / v["C"]) / v["R"] == pytest.approx(10, rel=1e-3)


def test_rlc_paralelo():
    v = solve_catalog_circuit("rlc_parallel_tank", {"f_0": 455_000, "q": 20})
    assert 1 / (2 * math.pi * math.sqrt(v["L"] * v["C"])) == pytest.approx(455_000)
    assert v["Rs"] * math.sqrt(v["C"] / v["L"]) == pytest.approx(20, rel=1e-3)


# --- lazo completo contra ngspice ------------------------------------------


def _correr(circuit_id: str, params: dict, measure: str, value: float, tolerance=0.01, thread="t"):
    spec = {
        "blocks": [
            {
                "id": "b",
                "type": "catalog",
                "params": {
                    "circuit_id": circuit_id,
                    "params": params,
                    "requirements": [{"measure": measure, "value": value}],
                },
            }
        ],
        "tolerance": tolerance,
    }
    estado = {
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
    return build_graph().invoke(estado, {"configurable": {"thread_id": thread}})


@pytest.mark.parametrize(
    ("circuit_id", "params", "measure", "value"),
    [
        ("opamp_inverting_amp", {"v_in": 0.5, "v_out": -5.0}, "v_out", -5.0),
        ("opamp_difference_amp", {"gain": 4.7}, "gain", 4.7),
        ("opamp_instrumentation_amp", {"gain": 100}, "gain", 100),
        ("opamp_instrumentation_amp", {"gain": 3.3}, "gain", 3.3),
        ("rlc_series_bandpass", {"f_0": 10_000, "q": 10}, "f0", 10_000),
        ("rlc_parallel_tank", {"f_0": 455_000, "q": 20}, "f0", 455_000),
    ],
)
def test_la_topologia_cumple_al_uno_por_ciento_con_valores_comerciales(
    circuit_id, params, measure, value
):
    final = _correr(circuit_id, params, measure, value, thread=f"{circuit_id}-{value}")

    assert final["verdict"]["status"] == "accepted"
    medido = final["sim_results"]["b"]["metrics"][measure]
    assert medido == pytest.approx(value, rel=0.01)


def test_el_restador_lista_dos_piezas_por_pareja():
    final = _correr("opamp_difference_amp", {"gain": 4.7}, "gain", 4.7, thread="dif-bom")

    cantidades = {m["nombre"]: m["cantidad"] for m in final["bom"]["b"]}
    assert cantidades == {"Rg": 2, "Rf": 2}


def test_el_curador_corrige_el_rlc_moviendo_l_y_no_r():
    # Sin combinar inductores, 25.3 mH cae entre 22 y 27 mH (E12): hace falta
    # el lazo. La regla genérica escalaba R, que no mueve f0.
    from agents.curador.policy import _adjust_catalog

    valores = {"L": 0.027, "C": 10e-9, "R": 160.0}
    ajustados = _adjust_catalog(valores, target=10_000, actual=9_686, circuit_id="rlc_series_bandpass")

    assert ajustados["R"] == 160.0
    assert ajustados["L"] == pytest.approx(0.027 * (9_686 / 10_000) ** 2)
