import pytest

from agents.evaluacion.banco import CasoInvalido, cargar_banco, validar_caso


def test_el_banco_de_la_tesina_tiene_veinte_casos_bien_formados():
    casos = cargar_banco()

    assert len(casos) == 20
    assert len({c["id"] for c in casos}) == 20, "hay ids repetidos"


def test_el_banco_cubre_las_cuatro_topologias():
    tipos = {c["spec"]["blocks"][0]["type"] for c in cargar_banco()}

    assert tipos == {"voltage_divider", "rc_lowpass", "led_resistor", "noninverting_amp"}


def test_cada_caso_declara_su_objetivo_y_su_referencia():
    for caso in cargar_banco():
        assert caso["descripcion"].strip(), f"{caso['id']} sin descripción"
        assert caso["referencia"]["objetivo"] > 0
        assert caso["referencia"]["componentes"], f"{caso['id']} sin solución de referencia"


def test_el_objetivo_declarado_coincide_con_el_parametro_del_spec():
    """La referencia y el spec tienen que contar la misma historia; si se
    separan, el banco mide una cosa y el sistema resuelve otra."""
    for caso in cargar_banco():
        params = caso["spec"]["blocks"][0]["params"]
        metrica = caso["referencia"]["metrica"]

        assert params[metrica] == pytest.approx(caso["referencia"]["objetivo"]), caso["id"]


def test_validar_caso_rechaza_uno_sin_referencia():
    with pytest.raises(CasoInvalido):
        validar_caso({"id": "x", "descripcion": "algo", "spec": {"blocks": []}})


def test_cargar_banco_acepta_una_ruta_propia(tmp_path):
    import yaml

    propio = tmp_path / "mini.yaml"
    propio.write_text(
        yaml.safe_dump(
            {
                "casos": [
                    {
                        "id": "uno",
                        "descripcion": "un divisor",
                        "spec": {
                            "blocks": [
                                {
                                    "id": "d1",
                                    "type": "voltage_divider",
                                    "params": {"v_in": 5.0, "v_out": 3.3},
                                }
                            ]
                        },
                        "referencia": {
                            "metrica": "v_out",
                            "objetivo": 3.3,
                            "componentes": {"r1": 1000.0, "r2": 1941.18},
                        },
                    }
                ]
            }
        )
    )

    assert [c["id"] for c in cargar_banco(propio)] == ["uno"]
