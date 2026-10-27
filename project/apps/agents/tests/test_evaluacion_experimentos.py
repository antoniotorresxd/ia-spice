import pytest

from agents import config as config_mod
from agents.evaluacion import experimentos as exp
from agents.evaluacion.banco import cargar_banco

DIVISOR = next(c for c in cargar_banco() if c["id"] == "divisor-5-3v3")
NEGATIVO = next(c for c in cargar_banco() if c["id"] == "negativo-divisor-elevador")


def _fila(**kw):
    base = {"esperado": "accepted", "estado": "accepted", "en_tolerancia": True,
            "medido": 1.0, "sim_error": None, "iteraciones": 1}
    base.update(kw)
    return base


@pytest.mark.parametrize(
    ("fila", "modo"),
    [
        (_fila(), exp.NINGUNA),
        (_fila(en_tolerancia=False), exp.FUERA_DE_TOLERANCIA_ACEPTADO),
        (_fila(estado="rejected", en_tolerancia=False, iteraciones=10), exp.AGOTO_ITERACIONES),
        (_fila(estado="rejected", en_tolerancia=False, iteraciones=4), exp.RECHAZO_TEMPRANO),
        (_fila(estado="rejected"), exp.OTRO_BLOQUE),
        (_fila(estado="rejected", en_tolerancia=False, medido=None, sim_error="boom"), exp.ERROR_SIMULACION),
        (_fila(estado="rejected", en_tolerancia=False, medido=None), exp.SIN_METRICA),
        (_fila(esperado="rejected", estado="rejected", en_tolerancia=False), exp.RECHAZO_CORRECTO),
        (_fila(esperado="rejected", estado="accepted"), exp.META_IMPOSIBLE_ACEPTADA),
    ],
)
def test_clasificar_falla_asigna_un_modo_por_regla(fila, modo):
    assert exp.clasificar_falla(fila, max_iteraciones=10) == modo


def test_un_caso_negativo_es_correcto_solo_si_se_rechaza():
    assert exp.es_correcto(_fila(esperado="rejected", estado="rejected", en_tolerancia=False))
    assert not exp.es_correcto(_fila(esperado="rejected", estado="accepted", en_tolerancia=True))


def test_el_plan_por_defecto_barre_tolerancia_por_iteraciones_y_agrega_ideales_y_repeticiones():
    condiciones = exp.cargar_condiciones()
    ids = [c.id for c in condiciones]

    assert "t5-i1" in ids and "t0.5-i10" in ids
    assert any(not c.comerciales for c in condiciones)
    finales = [c for c in condiciones if c.id == "t5-i10"]
    assert sorted(c.repeticion for c in finales) == [1, 2, 3]


def test_solo_final_devuelve_una_condicion():
    (cond,) = exp.cargar_condiciones(solo_final=True)

    assert (cond.tolerancia, cond.max_iteraciones, cond.comerciales) == (0.05, 10, True)


def test_la_configuracion_ideal_apaga_comerciales_y_se_restaura_al_salir():
    config_mod.reset_config_cache()
    antes = config_mod.get_config()["comerciales"]["habilitado"]

    with exp.configuracion(comerciales=False):
        assert config_mod.get_config()["comerciales"]["habilitado"] is False

    assert config_mod.get_config()["comerciales"]["habilitado"] == antes


def test_la_configuracion_se_restaura_aunque_la_corrida_falle():
    config_mod.reset_config_cache()
    previa = config_mod.get_config()

    with pytest.raises(RuntimeError):
        with exp.configuracion(comerciales=False):
            raise RuntimeError("boom")

    assert config_mod.get_config() is previa


def test_correr_condicion_contra_ngspice_anota_condicion_tiempo_y_falla():
    cond = exp.Condicion("t5-i3", 0.05, 3)

    filas = exp.correr_condicion([DIVISOR, NEGATIVO], cond)

    divisor, negativo = filas
    assert divisor["condicion"] == "t5-i3"
    assert divisor["requisito"] == "div1"
    assert divisor["segundos"] > 0
    assert divisor["modo_falla"] == exp.NINGUNA
    assert negativo["modo_falla"] == exp.RECHAZO_CORRECTO
    # el presupuesto de la condición manda sobre el del curador.yaml
    assert negativo["iteraciones"] == 3


def test_resumir_por_nivel_excluye_negativos_del_total_y_reporta_su_rechazo():
    filas = exp.correr_condicion([DIVISOR, NEGATIVO], exp.Condicion("t5-i3", 0.05, 3))

    resumen = {r["nivel"]: r for r in exp.resumir_por_nivel(filas)}

    assert resumen["total"]["requisitos"] == 1
    assert resumen["total"]["solve_rate"] == 1.0
    assert resumen["negativo"]["solve_rate"] is None
    assert resumen["negativo"]["rechazo_correcto"] == 1.0


def test_repetibilidad_detecta_una_diferencia_entre_corridas():
    a = {"condicion": "c", "id": "x", "repeticion": 1, "medido": 1.0, "iteraciones": 1, "estado": "accepted"}
    b = dict(a, repeticion=2)
    c = dict(a, repeticion=3, medido=1.1)

    assert exp.repetibilidad([a, b])["diferencias"] == 0
    assert exp.repetibilidad([a, b, c])["diferencias"] == 1
