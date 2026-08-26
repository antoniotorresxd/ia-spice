from agents.evaluacion.reporte import tabla_latex, tabla_markdown

RESULTADOS = [
    {
        "id": "divisor-12-5",
        "tipo": "voltage_divider",
        "estado": "accepted",
        "medido": 5.01,
        "objetivo": 5.0,
        "ape": 0.2,
        "en_tolerancia": True,
        "iteraciones": 1,
    },
    {
        "id": "led-5v-20ma",
        "tipo": "led_resistor",
        "estado": "rejected",
        "medido": None,
        "objetivo": 0.02,
        "ape": None,
        "en_tolerancia": False,
        "iteraciones": 5,
    },
]

RESUMEN = {
    "casos": 2,
    "medidos": 1,
    "sin_medicion": 1,
    "mape": 0.2,
    "tasa_aceptada": 0.5,
    "tasa_en_tolerancia": 0.5,
    "iteraciones_medias": 3.0,
}


def test_la_tabla_markdown_lista_cada_caso():
    salida = tabla_markdown(RESULTADOS, RESUMEN)

    assert "divisor-12-5" in salida
    assert "led-5v-20ma" in salida
    assert "MAPE" in salida


def test_un_caso_sin_medicion_se_marca_no_se_deja_en_blanco():
    salida = tabla_markdown(RESULTADOS, RESUMEN)

    assert "sin medición" in salida


def test_la_tabla_latex_es_pegable_en_la_tesina():
    salida = tabla_latex(RESULTADOS, RESUMEN)

    assert "\\begin{tabular}" in salida
    assert "\\end{tabular}" in salida
    # los ids llevan guiones, que en LaTeX hay que proteger
    assert "divisor-12-5" in salida or "divisor\\-12\\-5" in salida


def test_las_dos_tasas_aparecen_en_ambos_formatos():
    for salida in (tabla_markdown(RESULTADOS, RESUMEN), tabla_latex(RESULTADOS, RESUMEN)):
        assert "50.0" in salida or "0.50" in salida
