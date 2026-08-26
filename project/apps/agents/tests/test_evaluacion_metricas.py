import pytest

from agents.evaluacion.metricas import ape, mape, resumir


def test_ape_en_puntos_porcentuales():
    # 4.75 contra una meta de 5.0 es un 5 % de error
    assert ape(4.75, 5.0) == pytest.approx(5.0)


def test_ape_es_absoluto_no_importa_el_signo_del_desvio():
    assert ape(5.25, 5.0) == pytest.approx(ape(4.75, 5.0))


def test_mape_promedia():
    assert mape([2.0, 4.0, 6.0]) == pytest.approx(4.0)


def test_mape_sin_mediciones_es_none_no_cero():
    """Cero significaría 'perfecto'. Ninguna medición no es perfección."""
    assert mape([]) is None


def _resultado(**kwargs):
    base = {
        "id": "x",
        "tipo": "voltage_divider",
        "estado": "accepted",
        "medido": 5.0,
        "objetivo": 5.0,
        "ape": 0.0,
        "en_tolerancia": True,
        "iteraciones": 1,
    }
    return {**base, **kwargs}


def test_resumir_separa_la_tasa_aceptada_de_la_tasa_en_tolerancia():
    """La distinción que sostiene la honestidad del capítulo de resultados: el
    curador puede aceptar por recompensa algo ligeramente fuera de tolerancia."""
    resultados = [
        _resultado(id="a"),
        _resultado(id="b", ape=6.0, en_tolerancia=False),
        _resultado(id="c", estado="rejected", ape=40.0, en_tolerancia=False),
    ]

    resumen = resumir(resultados)

    assert resumen["casos"] == 3
    assert resumen["tasa_aceptada"] == pytest.approx(2 / 3)
    assert resumen["tasa_en_tolerancia"] == pytest.approx(1 / 3)


def test_resumir_calcula_el_mape_solo_sobre_los_medidos():
    """Un caso que no simuló no tiene error que promediar. Imputarle un valor
    maquillaría el MAPE; se cuenta aparte."""
    resultados = [
        _resultado(id="a", ape=2.0),
        _resultado(id="b", ape=4.0),
        _resultado(id="c", estado="rejected", medido=None, ape=None, en_tolerancia=False),
    ]

    resumen = resumir(resultados)

    assert resumen["mape"] == pytest.approx(3.0)
    assert resumen["medidos"] == 2
    assert resumen["sin_medicion"] == 1


def test_resumir_promedia_las_iteraciones():
    resultados = [_resultado(id="a", iteraciones=1), _resultado(id="b", iteraciones=3)]

    assert resumir(resultados)["iteraciones_medias"] == pytest.approx(2.0)


def test_resumir_de_una_lista_vacia_no_revienta():
    resumen = resumir([])

    assert resumen["casos"] == 0
    assert resumen["mape"] is None
    assert resumen["tasa_en_tolerancia"] == 0.0
