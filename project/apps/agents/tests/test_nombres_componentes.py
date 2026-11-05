"""El netlist entregado usa los nombres de componentes que pide el enunciado."""

from agents.escritura.nombres import renombrar_componentes
from agents.orquestador.schema import CatalogParams

INTEGRADOR = """* Practical Op-Amp Integrator
* Valores comerciales (circuito): ideal -> comercial
*   Rin: 19.3kohm -> 22kohm || 160kohm = 19.3kohm [E24, -0.02%]
Vin vin 0 DC 0 AC 1
Rin vin vminus 19340
Rf vminus vout 193406
Cf vminus vout 1.2155e-08
X1 0 vminus vout opamp
.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Eout out 0 n1 0 1
.ends
.control
ac dec 100 1 1e8
print i(Rin)
.endc
.end
"""


def test_renombra_elemento_comentario_y_corriente_sin_tocar_el_subcircuito():
    out = renombrar_componentes(INTEGRADOR, {"Rin": "R1"})

    assert "R1 vin vminus 19340" in out
    assert "*   R1: 19.3kohm" in out
    assert "print i(R1)" in out
    assert "Rin inp inn 1e6" in out  # dentro del .subckt es otro Rin
    assert "Rin vin" not in out


def test_ignora_cambios_de_tipo_choques_y_nombres_inexistentes():
    out = renombrar_componentes(INTEGRADOR, {"Rin": "C9", "Rf": "Cf", "Rx": "R7"})
    assert out == INTEGRADOR


def test_sin_nombres_no_cambia_nada():
    assert renombrar_componentes(INTEGRADOR, {}) == INTEGRADOR
    assert renombrar_componentes(INTEGRADOR, None) == INTEGRADOR


def test_intercambio_entre_dos_nombres():
    out = renombrar_componentes(INTEGRADOR, {"Rin": "Rf", "Rf": "Rin"})
    assert "Rf vin vminus 19340" in out and "Rin vminus vout 193406" in out


def test_el_schema_acepta_nombres_y_por_omision_es_vacio():
    base = {"circuit_id": "opamp_integrator_practical", "params": {"f_int": 1000},
            "requirements": [{"measure": "fint", "value": 1000}]}
    assert CatalogParams(**base).nombres == {}
    assert CatalogParams(**base, nombres={"Rin": "R1"}).nombres == {"Rin": "R1"}
