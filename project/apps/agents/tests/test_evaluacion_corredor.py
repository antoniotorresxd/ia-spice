import pytest

from agents.evaluacion.corredor import correr_caso, resultado_desde_estado

CASO = {
    "id": "divisor-5-3v3",
    "descripcion": "un divisor de 5 V a 3.3 V",
    "spec": {
        "blocks": [
            {
                "id": "div1",
                "type": "catalog",
                "params": {
                    "circuit_id": "voltage_divider",
                    "params": {"v_in": 5.0, "v_out": 3.3},
                    "requirements": [{"measure": "v_out", "value": 3.3}],
                },
            }
        ]
    },
    "referencia": [
        {"requisito": "div1", "metrica": "v_out", "objetivo": 3.3, "componentes": {"r1": 1000.0}}
    ],
}


def test_resultado_desde_estado_extrae_medicion_error_e_iteraciones():
    estado = {
        "verdict": {"status": "accepted", "reason": "ok", "best_iteration": 0},
        "sim_results": {"div1": {"metrics": {"v_out": 3.4}, "converged": True, "sim_error": None}},
        "normalized_spec": {"blocks": [{
            "id": "div1",
            "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.05}],
        }]},
        "iteration": 0,
        "history": [{"iteration": 0, "reward": 1.0}],
    }

    resultados = resultado_desde_estado(CASO, estado)

    assert len(resultados) == 1
    resultado = resultados[0]
    assert resultado["id"] == "divisor-5-3v3"
    assert resultado["estado"] == "accepted"
    assert resultado["medido"] == pytest.approx(3.4)
    assert resultado["ape"] == pytest.approx(abs(3.4 - 3.3) / 3.3 * 100)
    assert resultado["iteraciones"] == 1


def test_en_tolerancia_se_juzga_contra_la_tolerancia_del_caso_no_contra_el_veredicto():
    """Un circuito aceptado por recompensa puede estar fuera de tolerancia. El
    resultado tiene que decir la verdad sobre eso."""
    estado = {
        "verdict": {"status": "accepted", "reason": "aceptado por recompensa", "best_iteration": 0},
        # 3.6 contra 3.3 es 9.1 %, fuera de la tolerancia del 5 %
        "sim_results": {"div1": {"metrics": {"v_out": 3.6}, "converged": True, "sim_error": None}},
        "normalized_spec": {"blocks": [{
            "id": "div1",
            "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.05}],
        }]},
        "iteration": 0,
        "history": [],
    }

    resultado = resultado_desde_estado(CASO, estado)[0]

    assert resultado["estado"] == "accepted"
    assert resultado["en_tolerancia"] is False


def test_un_caso_sin_medicion_no_inventa_un_ape():
    estado = {
        "verdict": {"status": "rejected", "reason": "boom", "best_iteration": None},
        "sim_results": {"div1": {"metrics": None, "converged": False, "sim_error": "boom"}},
        "normalized_spec": {"blocks": [{
            "id": "div1",
            "requirements": [{"measure": "v_out", "value": 3.3, "tolerance": 0.05}],
        }]},
        "iteration": 4,
        "history": [],
    }

    resultado = resultado_desde_estado(CASO, estado)[0]

    assert resultado["medido"] is None
    assert resultado["ape"] is None
    assert resultado["en_tolerancia"] is False


def test_un_caso_con_dos_requisitos_produce_dos_filas_con_id_calificado():
    caso = {
        "id": "divisor-5-3v3",
        "descripcion": "cascada de prueba",
        "spec": {
            "blocks": [
                {"id": "hp", "type": "catalog", "params": {"circuit_id": "opamp_highpass_active"}},
                {"id": "amp", "type": "catalog", "params": {"circuit_id": "opamp_noninverting_amp"}},
            ]
        },
        "referencia": [
            {"requisito": "hp", "metrica": "fc_-3db", "objetivo": 500.0, "componentes": {}},
            {"requisito": "amp", "metrica": "gain_at_freq", "objetivo": 4.0, "componentes": {}},
        ],
    }
    estado = {
        "verdict": {"status": "accepted", "reason": "ok", "best_iteration": 0},
        "sim_results": {
            "hp": {"metrics": {"fc_-3db": 510.0}, "converged": True, "sim_error": None},
            "amp": {"metrics": {"gain_at_freq": 4.1}, "converged": True, "sim_error": None},
        },
        "normalized_spec": {
            "blocks": [
                {"id": "hp", "requirements": [{"measure": "fc_-3db", "value": 500.0, "tolerance": 0.05}]},
                {"id": "amp", "requirements": [{"measure": "gain_at_freq", "value": 4.0, "tolerance": 0.05}]},
            ]
        },
        "iteration": 0,
        "history": [],
    }

    resultados = resultado_desde_estado(caso, estado)

    assert [r["id"] for r in resultados] == ["divisor-5-3v3/hp", "divisor-5-3v3/amp"]
    assert resultados[0]["medido"] == pytest.approx(510.0)
    assert resultados[1]["medido"] == pytest.approx(4.1)


def test_correr_caso_ejecuta_el_grafo_real_contra_ngspice():
    """De punta a punta con el binario de verdad, como todas las pruebas de
    este proyecto."""
    resultados = correr_caso(CASO)

    assert len(resultados) == 1
    resultado = resultados[0]
    assert resultado["id"] == "divisor-5-3v3"
    assert resultado["estado"] == "accepted"
    assert resultado["en_tolerancia"] is True
    assert resultado["ape"] < 5.0
