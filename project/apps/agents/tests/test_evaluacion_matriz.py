import pytest

openpyxl = pytest.importorskip("openpyxl")

from agents.evaluacion import experimentos as exp  # noqa: E402
from agents.evaluacion.banco import cargar_banco  # noqa: E402
from agents.evaluacion.matriz import COL, construir_matriz, contar_pruebas  # noqa: E402
from agents.evaluacion.reporte import tablas_experimentos_latex  # noqa: E402

CASOS = [c for c in cargar_banco() if c["id"] in ("divisor-5-3v3", "rc-1khz", "negativo-divisor-elevador")]
META = {"fecha": "hoy", "commit": "abc1234", "ngspice": "ngspice-42", "tolerancia_por_defecto": 0.05,
        "max_iteraciones_por_defecto": 5, "max_iteraciones_cap": 10, "serie_resistencias": "E24",
        "serie_capacitores": "E12", "temperatura_llm": 0.0}


@pytest.fixture(scope="module")
def corrida():
    condiciones = [exp.Condicion("t5-i1", 0.05, 1), exp.Condicion("t5-i3", 0.05, 3),
                   exp.Condicion("t5-i3-ideal", 0.05, 3, comerciales=False)]
    filas = exp.correr_todo(CASOS, condiciones)
    return condiciones, filas


def test_la_matriz_tiene_las_hojas_del_capitulo(corrida):
    condiciones, filas = corrida
    wb = construir_matriz(filas, CASOS, condiciones, META, final_id="t5-i3", repetibilidad=exp.repetibilidad(filas))

    assert wb.sheetnames == ["Leeme", "Resumen", "Diseno experimental", "Resultados", "Banco",
                             "Linea base NL", "Franco", "Trazabilidad SRS", "Pruebas unitarias"]


def test_resultados_trae_una_fila_por_condicion_y_requisito_con_formulas(corrida):
    condiciones, filas = corrida
    wb = construir_matriz(filas, CASOS, condiciones, META, final_id="t5-i3", repetibilidad=exp.repetibilidad(filas))
    ws = wb["Resultados"]

    assert ws.max_row - 4 == len(filas) == 3 * 3
    assert ws[f"{COL['APE (%)']}5"].value.startswith("=")
    assert ws[f"{COL['Cumple']}5"].value.startswith("=")
    assert ws[f"{COL['Medido']}5"].value == pytest.approx(filas[0]["medido"])


def test_las_tablas_latex_se_generan_para_la_corrida(corrida):
    _, filas = corrida
    resumen = exp.resumir_por_nivel(filas)

    tex = tablas_experimentos_latex(filas, resumen, final_id="t5-i3", repetibilidad=exp.repetibilidad(filas))

    assert "\\begin{tabular}" in tex
    assert "Tabla A" in tex and "Tabla E" in tex
    assert "rechazo 100.0" in tex


def test_el_inventario_de_pruebas_se_cuenta_del_arbol_actual():
    filas = contar_pruebas()
    archivos = {a for a, _, _ in filas}

    assert "agents/tests/test_evaluacion_matriz.py" in archivos
    assert all(n >= 0 for _, _, n in filas)
