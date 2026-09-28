import pytest

from agents.evaluacion.banco import CasoInvalido, cargar_banco, validar_caso


def test_el_banco_de_la_tesina_tiene_dieciseis_casos_bien_formados():
    casos = cargar_banco()

    assert len(casos) == 16
    assert len({c["id"] for c in casos}) == 16, "hay ids repetidos"


def test_el_banco_cubre_los_tipos_curados_vigentes():
    circuit_ids = {
        block["params"]["circuit_id"]
        for c in cargar_banco()
        for block in c["spec"]["blocks"]
    }

    assert {"voltage_divider", "rc_lowpass_passive", "opamp_noninverting_amp", "opamp_highpass_active"} <= circuit_ids


def test_cada_caso_declara_su_descripcion_y_al_menos_un_requisito_de_referencia():
    for caso in cargar_banco():
        assert caso["descripcion"].strip(), f"{caso['id']} sin descripción"
        assert caso["referencia"], f"{caso['id']} sin requisitos de referencia"
        for requisito in caso["referencia"]:
            assert requisito["objetivo"] > 0
            assert requisito["componentes"], f"{caso['id']}/{requisito['requisito']} sin solución de referencia"


def test_el_objetivo_declarado_coincide_con_el_requirement_del_bloque():
    """La referencia y el spec tienen que contar la misma historia; si se
    separan, el banco mide una cosa y el sistema resuelve otra."""
    for caso in cargar_banco():
        requisitos_por_metrica = {r["metrica"]: r["objetivo"] for r in caso["referencia"]}
        for block in caso["spec"]["blocks"]:
            for requirement in block["params"]["requirements"]:
                objetivo = requisitos_por_metrica.get(requirement["measure"])
                if objetivo is not None:
                    assert requirement["value"] == pytest.approx(objetivo), caso["id"]


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
                            {
                                "requisito": "d1",
                                "metrica": "v_out",
                                "objetivo": 3.3,
                                "componentes": {"r1": 1000.0, "r2": 1941.18},
                            }
                        ],
                    }
                ]
            }
        )
    )

    assert [c["id"] for c in cargar_banco(propio)] == ["uno"]
