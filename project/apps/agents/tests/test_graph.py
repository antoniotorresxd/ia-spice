# project/apps/agents/tests/test_graph.py
import os
from unittest.mock import MagicMock

import pytest

import agents.orquestador.node as orquestador_module
from agents.graph import build_graph
from agents.orquestador.schema import CircuitSpec


def _initial_state(circuit_spec):
    return {
        "circuit_spec": circuit_spec,
        "request_text": None,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }


def _run(circuit_spec, thread_id):
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    return graph.invoke(_initial_state(circuit_spec), config)


def test_voltage_divider_converges_first_iteration():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ]
    }

    final = _run(spec, "e2e-divider")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) == 1
    v_out = final["sim_results"]["div1"]["metrics"]["v_out"]
    assert v_out == pytest.approx(3.3, rel=0.05)


def test_led_requires_adjustment_then_converges():
    # el modelo de diodo tiene Vf ~2.18 V a 20 mA, distinto del v_f=2.0 del
    # spec, así que la primera iteración queda ~6% fuera con tolerancia 1%
    # y el curador debe ajustar al menos una vez antes de converger
    spec = {
        "blocks": [
            {"id": "led1", "type": "led_resistor", "params": {"v_in": 5.0, "v_f": 2.0, "i_led": 0.02}}
        ],
        "tolerance": 0.01,
    }

    final = _run(spec, "e2e-led-adjust")

    assert final["verdict"]["status"] == "accepted"
    assert len(final["history"]) >= 2
    assert final["history"][0]["decision"] == "adjust"
    i_led = final["sim_results"]["led1"]["metrics"]["i_led"]
    assert i_led == pytest.approx(0.02, rel=0.01)


def test_impossible_spec_rejected_at_max_iterations():
    # v_out > v_in: inalcanzable; el ajuste empuja r2 hacia arriba pero
    # v_out nunca supera v_in
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 6.0}}
        ],
        "max_iterations": 3,
    }

    final = _run(spec, "e2e-impossible")

    assert final["verdict"]["status"] == "rejected"
    assert len(final["history"]) == 3
    assert final["verdict"]["best_iteration"] is not None


def test_mixed_blocks_evaluated_globally():
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}},
            {"id": "rc1", "type": "rc_lowpass", "params": {"f_c": 1000.0}},
        ]
    }

    final = _run(spec, "e2e-mixed")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(3.3, rel=0.05)
    assert final["sim_results"]["rc1"]["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.05)


def test_invalid_spec_rejected_without_simulation():
    final = _run({"blocks": []}, "e2e-invalid")

    assert final["verdict"]["status"] == "rejected"
    assert final["normalized_spec"] is None
    assert final["sim_results"] == {}


def test_graph_checkpoints_state_by_thread_id():
    graph = build_graph()
    spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 9.0, "v_out": 6.0}}
        ]
    }
    config = {"configurable": {"thread_id": "e2e-checkpoint"}}

    graph.invoke(_initial_state(spec), config)
    snapshot = graph.get_state(config)

    assert snapshot.values["verdict"]["status"] == "accepted"
    assert snapshot.values["sim_results"]["div1"]["metrics"]["v_out"] == pytest.approx(
        6.0, rel=0.05
    )


def test_request_text_end_to_end_with_fake_llm(monkeypatch):
    fake_spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
            ]
        }
    )
    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module, "extract_circuit_spec", lambda chat_model, text: fake_spec
    )

    spec = {"blocks": []}  # circuit_spec vacio: se ignora porque hay request_text
    graph = build_graph()
    config = {"configurable": {"thread_id": "e2e-request-text", "user_id": "test-user"}}
    initial_state = {
        "circuit_spec": spec,
        "request_text": "dame un divisor de 5V a 3.3V",
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final = graph.invoke(initial_state, config)

    assert final["verdict"]["status"] == "accepted"
    v_out = final["sim_results"]["div1"]["metrics"]["v_out"]
    assert v_out == pytest.approx(3.3, rel=0.05)


@pytest.mark.live_llm
@pytest.mark.skipif(
    not (os.environ.get("SERVER_BASE_URL") and os.environ.get("AGENTS_SERVICE_TOKEN")),
    reason="requires a running server with SERVER_BASE_URL/AGENTS_SERVICE_TOKEN and an active LLM",
)
def test_request_text_end_to_end_with_live_llm():
    graph = build_graph()
    config = {"configurable": {"thread_id": "e2e-live-llm", "user_id": "test-user"}}
    initial_state = {
        "circuit_spec": {},
        "request_text": "Necesito un divisor de voltaje que baje 5V a 3.3V",
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final = graph.invoke(initial_state, config)

    assert final["verdict"]["status"] == "accepted"


def test_noninverting_amp_converges_end_to_end():
    """El lazo completo contra ngspice real con un circuito realimentado."""
    spec = {
        "blocks": [
            {
                "id": "amp1",
                "type": "noninverting_amp",
                "params": {"v_in": 1.0, "v_out": 3.0},
            }
        ],
        "tolerance": 0.01,
    }

    final = _run(spec, "e2e-amp")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["amp1"]["metrics"]["v_out"] == pytest.approx(3.0, rel=0.01)
    assert ".subckt opamp" in final["netlists"]["amp1"]["text"]


def test_noninverting_amp_high_gain_needs_the_loop():
    """Ganancia 1000, donde la ecuación ideal Av = 1 + Rf/Rg se queda corta
    casi un 1 % porque la ganancia en lazo abierto del operacional es finita.

    Es el argumento central de la tesina hecho prueba: la ecuación de diseño
    por sí sola no acierta, la simulación lo detecta y el lazo lo corrige."""
    spec = {
        "blocks": [
            {
                "id": "amp1",
                "type": "noninverting_amp",
                "params": {"v_in": 0.01, "v_out": 10.0},
            }
        ],
        "tolerance": 0.001,
    }

    final = _run(spec, "e2e-amp-highgain")

    assert final["verdict"]["status"] == "accepted"
    # la primera pasada cae fuera de tolerancia: hizo falta ajustar
    assert len(final["history"]) >= 2
    assert final["history"][0]["decision"] == "adjust"
    assert final["sim_results"]["amp1"]["metrics"]["v_out"] == pytest.approx(10.0, rel=0.001)


def test_noninverting_amp_with_unreachable_gain_is_rejected():
    """Un no inversor no atenúa: pedirle 2 V a partir de 5 V es físicamente
    imposible. El sistema emite un circuito válido, lo simula, ve que no se
    acerca, agota las iteraciones y rechaza — nunca entrega algo que no cumple
    haciéndolo pasar por bueno."""
    spec = {
        "blocks": [
            {
                "id": "amp1",
                "type": "noninverting_amp",
                "params": {"v_in": 5.0, "v_out": 2.0},
            }
        ],
        "max_iterations": 3,
    }

    final = _run(spec, "e2e-amp-imposible")

    assert final["verdict"]["status"] == "rejected"
    assert final["verdict"]["best_iteration"] is not None
    # se simuló de verdad en cada intento, no se abandonó antes de medir
    assert final["sim_results"]["amp1"]["sim_error"] is None


def test_un_circuito_fuera_del_catalogo_se_resuelve_por_el_camino_generico():
    """La prueba de que el sistema dejó de estar cerrado a su catálogo.

    El netlist llega ya escrito —como lo entregaría el LLM— y el lazo lo trata
    igual que a cualquier otro: lo simula con ngspice, mide y decide. Nada se
    acepta por parecer correcto.
    """
    netlist = (
        "* divisor entregado como bloque generico\n"
        "Vinput vin 0 10.0\n"
        "R1 vin vout 1000\n"
        "R2 vout 0 1000\n"
        ".control\n"
        "op\n"
        "wrdata output.txt v(vout)\n"
        ".endc\n"
        ".end\n"
    )
    spec = {
        "blocks": [
            {
                "id": "gen1",
                "type": "generic",
                "params": {
                    "description": "un divisor resistivo simple",
                    "metric": "v_out",
                    "target": 5.0,
                    "netlist": netlist,
                },
            }
        ]
    }

    final = _run(spec, "e2e-generico")

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["gen1"]["metrics"]["v_out"] == pytest.approx(5.0, rel=0.01)
    assert final["sim_results"]["gen1"]["converged"] is True


def test_el_camino_generico_tambien_llega_desde_lenguaje_natural(monkeypatch):
    """El recorrido completo: prompt libre -> el LLM elige `generic` y escribe
    el netlist -> ngspice arbitra."""
    netlist = (
        "* pasa-bajas RC entregado por el modelo\n"
        "Vinput vin 0 DC 0 AC 1\n"
        "R1 vin vout 1000\n"
        "C1 vout 0 1.5915e-07\n"
        ".control\n"
        "ac dec 100 1 1e9\n"
        "meas ac fc WHEN vdb(vout)=-3.0103\n"
        "echo $&fc > output.txt\n"
        ".endc\n"
        ".end\n"
    )
    fake_spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {
                    "id": "gen1",
                    "type": "generic",
                    "params": {
                        "description": "filtro pasa-bajas de 1 kHz",
                        "metric": "f_c",
                        "target": 1000.0,
                        "netlist": netlist,
                    },
                }
            ]
        }
    )
    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda user_id: MagicMock())
    monkeypatch.setattr(
        orquestador_module, "extract_circuit_spec", lambda chat_model, text: fake_spec
    )

    graph = build_graph()
    initial = _initial_state({"blocks": []})
    initial["request_text"] = "quiero un filtro que corte en 1 kHz"

    final = graph.invoke(
        initial,
        {"configurable": {"thread_id": "e2e-generico-nl", "user_id": "test-user"}},
    )

    assert final["verdict"]["status"] == "accepted"
    assert final["sim_results"]["gen1"]["metrics"]["f_c"] == pytest.approx(1000.0, rel=0.01)
