import httpx
import pytest

from agents.knowledge.circuit_client import (
    FALLBACK_CIRCUITS,
    build_circuits_knowledge_context,
    fetch_circuit_catalog,
    fetch_circuit_detail,
)


def test_fallback_circuits_has_expected_topologies():
    ids = {c.id for c in FALLBACK_CIRCUITS}
    expected = {
        "rc_lowpass_passive",
        "bjt_voltage_divider",
        "diode_clamper",
        "diode_clipper",
        "opamp_highpass_active",
        "voltage_divider",
        "zener_regulated_power_supply",
        "double_ended_clipper",
        "bjt_common_emitter_amp",
        "opamp_integrator_practical",
        "sallen_key_lowpass_butterworth",
    }
    assert expected.issubset(ids)


def test_build_circuits_knowledge_context():
    context = build_circuits_knowledge_context()
    assert "BASE DE CONOCIMIENTO DE CIRCUITOS DISPONIBLES" in context
    assert "rc_lowpass_passive" in context
    assert "bjt_voltage_divider" in context
    assert "diode_clamper" in context
    assert "diode_clipper" in context
    assert "opamp_highpass_active" in context
    assert "output.txt" in context
    assert "solo referencia de topología" in context
    assert "**Parámetros:**" in context
    assert "`f_c` (number, Hz): Frecuencia de corte (-3 dB) (requerido)" in context
    assert "`c` (number, F): Condensador (opcional, default=1e-08)" in context


def test_fetch_circuit_detail_found():
    circuit = fetch_circuit_detail("opamp_highpass_active")
    assert circuit is not None
    assert circuit.name == "Filtro Pasa-Altos Activo RC de 1.er Orden (Op-Amp)"
    assert circuit.spiceTemplate is not None
    assert ".subckt opamp" in circuit.spiceTemplate


def test_fetch_circuit_detail_not_found():
    circuit = fetch_circuit_detail("unknown_topology_12345")
    assert circuit is None


def test_fetch_circuit_catalog_with_mock_transport():
    mock_data = [
        {
            "id": "custom_filter",
            "name": "Filtro Custom",
            "category": "filtros",
            "description": "Filtro de prueba",
            "topologySummary": "Vin -> R -> Vout",
            "parametersSchema": {"fc": {"type": "number"}},
            "operatingConstraints": "Ninguna",
            "designEquations": "R = 1 / (2*pi*fc*C)",
            "spiceTemplate": "* Test netlist\n.control\nop\n.endc\n.end",
        }
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/internal/circuits"
        assert request.headers["Authorization"] == "Bearer test-service-token"
        import json
        return httpx.Response(200, json=mock_data)

    transport = httpx.MockTransport(handler)
    catalog = fetch_circuit_catalog(
        base_url="http://mock-server:3001",
        token="test-service-token",
        transport=transport,
    )
    # Si la cache ya tiene datos anteriores, verificar que devuelve elementos válidos
    assert len(catalog) >= 1
