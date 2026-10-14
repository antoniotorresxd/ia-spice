import pytest

from agents.comerciales.piezas import (
    aterrizar_zener,
    comentarios_piezas,
    identificar_semiconductores,
    usar_modelos_reales,
    zener_comercial,
)
from agents.knowledge.circuit_client import fetch_circuit_detail
from agents.shell.ngspice_runner import parse_wrdata_scalar, run_ngspice

CE = """* CE
VCC vcc 0 DC 12
RB1 vcc vb 47k
RB2 vb 0 10k
RC vcc vc 3.9k
RE ve 0 1k
Q1 vc vb ve NPN_MODEL
.model NPN_MODEL NPN(BF=100)
.control
op
let vceq = v(vc) - v(ve)
echo $&vceq > output.txt
.endc
.end
"""


@pytest.mark.parametrize(
    ("vz", "pieza"),
    [(5.0, ("1N4733A")), (9.0, "1N4739A"), (12.0, "1N4742A"), (3.3, "1N4728A"), (33.0, "1N4752A")],
)
def test_zener_comercial(vz, pieza):
    assert zener_comercial(vz)[1] == pieza


def test_zener_fuera_de_la_serie():
    assert zener_comercial(1.2) is None
    assert zener_comercial(100.0) is None


def test_aterrizar_zener_avisa_lo_pedido():
    valores, pedido = aterrizar_zener({"VZ": 9.0, "RZ": 100.0})
    assert valores == {"VZ": 9.1, "RZ": 100.0}
    assert pedido == 9.0
    assert aterrizar_zener({"VZ": 5.1}) == ({"VZ": 5.1}, None)
    assert aterrizar_zener({"R": 1.0}) == ({"R": 1.0}, None)


def test_usar_modelos_reales_cambia_la_tarjeta_y_la_referencia():
    real = usar_modelos_reales(CE)

    assert "Q1 vc vb ve 2N3904" in real
    assert ".model 2N3904 NPN(IS=6.734f" in real
    assert "NPN_MODEL" not in real


def test_el_modelo_real_simula_en_ngspice(tmp_path):
    ruta = tmp_path / "ce.cir"
    ruta.write_text(usar_modelos_reales(CE))

    salida, error = run_ngspice(str(ruta))

    assert error is None
    vceq = parse_wrdata_scalar(salida)
    assert 1.0 < vceq < 11.0  # polarizado en zona activa


def test_identificar_semiconductores():
    piezas = identificar_semiconductores(usar_modelos_reales(CE))

    assert [(p["tipo"], p["pieza"], p["cantidad"], p["modelo_real"]) for p in piezas] == [
        ("transistor", "2N3904", 1, True)
    ]


def test_identificar_el_zener_por_su_bv():
    zener = fetch_circuit_detail("zener_regulated_power_supply").spiceTemplate.replace("{VZ}", "5.1")

    (pieza,) = [p for p in identificar_semiconductores(zener) if p["tipo"] == "zener"]
    assert pieza["pieza"] == "1N4733A"


def test_los_opamps_se_agrupan_por_encapsulado():
    ina = fetch_circuit_detail("opamp_instrumentation_amp").spiceTemplate

    (opamp,) = [p for p in identificar_semiconductores(ina) if p["tipo"] == "op-amp"]
    assert (opamp["pieza"], opamp["cantidad"], opamp["referencias"]) == ("TL084", 1, ["X1", "X2", "X3"])
    assert opamp["modelo_real"] is False  # lo dice la lista, no se esconde


def test_lo_de_dentro_de_un_subckt_no_cuenta_como_pieza():
    netlist = ".subckt opamp inp inn out\nQ9 a b c NPN\n.ends\nX1 a b c opamp\n"
    assert [p["tipo"] for p in identificar_semiconductores(netlist)] == ["op-amp"]


def test_comentarios_piezas():
    lineas = comentarios_piezas(identificar_semiconductores(usar_modelos_reales(CE)))
    assert lineas[0] == "* Semiconductores:"
    assert "1 x 2N3904" in lineas[1]
