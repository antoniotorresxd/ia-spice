"""Genera la matriz de pruebas (xlsx) con los resultados de una corrida.

Lo invoca `agents.evaluacion.experimentos`; no se corre solo. Los resultados
de la ruta estructurada llegan ya capturados. Lo derivado (APE, cumple,
tablas de resumen) va como FÓRMULA de Excel, no como número calculado en
Python: así quien revise la tesina puede auditar cada cifra hasta su fila.
Las condiciones que necesitan un LLM (línea base, lenguaje natural, Franco)
quedan como hojas con celdas amarillas para capturar a mano.
"""

import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

from agents.evaluacion.banco import NIVELES
from agents.evaluacion.experimentos import MODOS_DE_FALLA, RAIZ

_F = "Arial"
_NAVY = "1F2A44"
_AMARILLO = PatternFill("solid", fgColor="FFF2CC")
_HDR = PatternFill("solid", fgColor=_NAVY)
_SUB = PatternFill("solid", fgColor="E6EAF0")
_lado = Side(style="thin", color="BFC5CE")
_CAJA = Border(left=_lado, right=_lado, top=_lado, bottom=_lado)
_ARRIBA = Alignment(wrap_text=True, vertical="top")
_CENTRO = Alignment(horizontal="center", vertical="center", wrap_text=True)
AZUL, VERDE, NEGRO, ROJO = "0000FF", "008000", "000000", "C00000"

NOMBRE_NIVEL = {"basico": "Básico", "intermedio": "Intermedio", "avanzado": "Avanzado",
                "limite": "Límite", "negativo": "Negativo", "sin_nivel": "Sin nivel"}


def _font(negrita=False, color=NEGRO, tam=10, cursiva=False):
    return Font(name=_F, bold=negrita, color=color, size=tam, italic=cursiva)


def _titulo(ws, texto, sub=None):
    ws["A1"] = texto
    ws["A1"].font = _font(True, _NAVY, 14)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = _font(cursiva=True, color="555555")


def _seccion(ws, fila, texto):
    ws.cell(row=fila, column=1, value=texto).font = _font(True, _NAVY, 12)


def _encabezado(ws, fila, columnas, inicio=1):
    for i, c in enumerate(columnas):
        celda = ws.cell(row=fila, column=inicio + i, value=c)
        celda.font = _font(True, "FFFFFF")
        celda.fill = _HDR
        celda.alignment = _CENTRO
        celda.border = _CAJA


def _c(ws, fila, col, valor=None, *, color=NEGRO, relleno=None, centro=False, fmt=None, negrita=False):
    celda = ws.cell(row=fila, column=col, value=valor)
    celda.font = _font(negrita, color)
    celda.border = _CAJA
    celda.alignment = _CENTRO if centro else _ARRIBA
    if relleno:
        celda.fill = relleno
    if fmt:
        celda.number_format = fmt
    return celda


def _anchos(ws, anchos):
    for i, w in enumerate(anchos, 1):
        ws.column_dimensions[L(i)].width = w


# --------------------------------------------------------------------- datos fijos

PREGUNTAS = [
    ("P1", "¿El sistema genera circuitos que cumplen las metas eléctricas solicitadas?",
     "Ninguna (configuración final)", "Solve rate, MAPE, iteraciones, por nivel",
     "Un requisito se resuelve si APE ≤ tolerancia dentro del presupuesto de iteraciones",
     "Resumen · Tabla D"),
    ("P2", "¿El lazo de retroalimentación con SPICE mejora el resultado?",
     "Tolerancia × presupuesto de iteraciones", "Solve rate, MAPE e iteraciones por celda",
     "Con tolerancia estricta, el solve rate crece con las iteraciones",
     "Resumen · Tablas A, B, C"),
    ("P3", "¿Cuánto aporta el ecosistema frente a un LLM solo?",
     "Método: LLM solo (C0) vs. sistema desde lenguaje natural (C6)", "Pass@1, Pass@3",
     "Pass@1(C6) > Pass@1(C0)", "Linea base NL (captura manual)"),
    ("P4", "¿Cuánto error introduce restringirse a componentes comerciales?",
     "Valores comerciales vs. teóricos", "Δ solve rate, Δ MAPE",
     "El solve rate con valores comerciales se mantiene cerca del ideal", "Resumen · Tabla E"),
    ("P5", "¿El sistema interpreta correctamente enunciados en lenguaje natural?",
     "Ninguna (ruta NL, biblioteca Franco)", "% modo, % valores, % ngspice, Pass@1",
     "Aprobado = modo ∧ valores ∧ ngspice", "Franco (captura manual)"),
    ("P6", "¿El sistema rechaza metas imposibles en lugar de entregar algo incorrecto?",
     "Ninguna (casos de nivel negativo)", "Tasa de rechazo correcto, iteraciones gastadas",
     "Veredicto rejected en todos los negativos", "Resumen · Tablas D y F"),
    ("P7", "¿Cuál es el costo de una solución?",
     "Condición", "Tiempo por caso, iteraciones; llamadas y tokens en rutas con LLM",
     "Tiempo por iteración dentro de la meta de RNF-01.1", "Resumen · Tabla G"),
    ("P8", "¿Los resultados son repetibles?",
     "Repetición de la configuración final", "Diferencias entre corridas",
     "Cero diferencias en la ruta estructurada", "Resumen · Tabla H"),
]

TRAZABILIDAD = [
    ("RF-01.1", "Lectura de la descripción del circuito", "test_extraction, test_orquestador; P5", "Unitaria + experimental"),
    ("RF-01.2", "Extracción de parámetros", "test_extraction, test_structured; P5", "Unitaria + experimental"),
    ("RF-01.3", "Reparto de tareas", "test_orquestador, test_graph", "Integración"),
    ("RF-01.4", "Control del ciclo de ajuste", "test_graph, test_curador; P2", "Integración + experimental"),
    ("RF-01.5", "Manejo de errores", "test_api, test_graph; P6", "Integración + experimental"),
    ("RF-02.1", "División en sub-bloques (Map)", "test_composition, test_calculo", "Unitaria"),
    ("RF-02.2", "Cálculo de valores por worker", "test_calculo, test_catalog_solver, test_simbolico", "Unitaria"),
    ("RF-02.3", "Unión de resultados (Reduce)", "test_composition, test_sintesis; casos compuestos", "Unitaria + experimental"),
    ("RF-02.4", "Límite de contexto por worker", "Sin prueba identificada", "Pendiente"),
    ("RF-03.1", "Lectura de las métricas", "test_curador, test_curve", "Unitaria"),
    ("RF-03.2", "Cálculo de la recompensa", "test_reward", "Unitaria"),
    ("RF-03.3", "Decisión sobre el circuito", "test_curador; P1, P6", "Unitaria + experimental"),
    ("RF-03.4", "Sugerencia de ajustes", "test_reparacion, test_curador; P2", "Unitaria + experimental"),
    ("RF-04.1", "Ejecución del código PySpice", "test_ngspice_runner, test_netlist; banco completo", "Integración"),
    ("RF-04.2", "Llamada a ngspice y lectura de resultados", "test_ngspice_runner, test_curve", "Integración"),
    ("RF-04.3", "Clasificación de errores de simulación", "test_ngspice_runner, test_autocorreccion", "Unitaria"),
    ("RF-05.1", "Generación del código PySpice", "test_netlist, test_topologias", "Unitaria"),
    ("RF-05.2", "Reporte de métricas", "test_curve, test_evaluacion_reporte", "Unitaria"),
    ("RF-05.3", "Corrección del código ante errores", "test_autocorreccion", "Unitaria"),
    ("RF-05.4", "Reporte final al usuario", "test_documentador, test_api_stream", "Integración"),
    ("RF-06.1", "Gestión de usuarios y sesiones", "Sin prueba identificada en server", "Pendiente"),
    ("RF-06.2", "Gestión de espacios de trabajo", "workspace.*.test.ts", "Unitaria + integración"),
    ("RF-06.3", "Emisión y revocación de API keys", "llm.crypto.test.ts, llm.routes.test.ts (confirmar alcance)", "Unitaria"),
    ("RF-06.4", "Reenvío de solicitudes al servidor", "workspace.runner.test.ts, circuit.routes.test.ts", "Integración"),
    ("RNF-01.1", "Tiempo de una iteración", "P7", "Experimental"),
    ("RNF-01.2", "Workers en paralelo", "test_composition, test_graph; P7", "Integración + medición"),
    ("RNF-02.1", "Repetibilidad de resultados", "P8", "Experimental"),
    ("RNF-02.2", "Reintentos ante fallo de la API", "Por confirmar (test_factory?)", "Pendiente"),
    ("RNF-03.1", "Escalabilidad horizontal del servidor", "Prueba de carga (k6 / Locust)", "Carga"),
    ("RNF-03.2", "Tolerancia a fallos", "test_checkpointer + prueba de caída", "Integración"),
    ("RNF-03.3", "Balanceo de cargas", "Prueba de carga", "Carga"),
    ("RNF-04.1", "Agentes como módulos separados", "Inspección de src/agents", "Inspección"),
    ("RNF-04.2", "Configuración externa de parámetros", "test_config; experimentos.yaml", "Unitaria + experimental"),
    ("RNF-05.1", "Registro de iteraciones", "test_checkpointer, test_api_trace", "Integración"),
]

_PATRON_PY = re.compile(r"^\s*(async\s+)?def test_", re.M)
_PATRON_TS = re.compile(r"^\s*(it|test)\(", re.M)


def contar_pruebas(raiz_agents: Path = RAIZ) -> list[tuple[str, str, int]]:
    """Cuenta funciones de prueba por archivo, en el árbol actual. Se recalcula
    en cada corrida para que el inventario no se quede viejo."""
    filas = []
    for p in sorted((raiz_agents / "tests").glob("test_*.py")):
        filas.append((f"agents/tests/{p.name}", "agents (pytest)", len(_PATRON_PY.findall(p.read_text(encoding="utf-8")))))
    server = raiz_agents.parent / "server" / "src"
    if server.is_dir():
        for p in sorted(server.rglob("*.test.ts")):
            if "node_modules" in p.parts:
                continue
            filas.append((f"server/src/{p.relative_to(server)}", "server (bun test)",
                          len(_PATRON_TS.findall(p.read_text(encoding="utf-8")))))
    return filas


# --------------------------------------------------------------------- hojas

def _hoja_leeme(wb, meta, condiciones, final_id):
    ws = wb.active
    ws.title = "Leeme"
    _titulo(ws, "Matriz de pruebas — Ecosistema multiagente IA-SPICE",
            f"Generada por agents.evaluacion.experimentos el {meta['fecha']} (commit {meta['commit']})")
    r = 4
    _seccion(ws, r, "Cómo leer este libro")
    guia = [
        ("Resultados", "Una fila por condición × repetición × requisito, capturada por el corredor. APE, Cumple y Correcto son fórmulas."),
        ("Resumen", "Tablas del capítulo, todas fórmula sobre 'Resultados'. Las mismas cifras salen en tablas.tex."),
        ("Celdas amarillas", "Solo existen en las hojas de condiciones con LLM ('Linea base NL', 'Franco') y en 'Trazabilidad SRS': se capturan a mano."),
        ("Colores", "Azul = dato capturado. Verde = vínculo a otra hoja. Negro = fórmula."),
        ("Regenerar", "uv run python -m agents.evaluacion.experimentos  (desde project/apps/agents)."),
    ]
    for k, v in guia:
        r += 1
        _c(ws, r, 1, k, negrita=True, relleno=_SUB)
        _c(ws, r, 2, v)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
        ws.row_dimensions[r].height = 30

    r += 2
    _seccion(ws, r, "Configuración experimental")
    r += 1
    _encabezado(ws, r, ["Parámetro", "Valor"])
    for k, v in [
        ("Commit evaluado", meta["commit"]), ("Fecha", meta["fecha"]), ("ngspice", meta["ngspice"]),
        ("Tolerancia por defecto (curador.yaml)", meta["tolerancia_por_defecto"]),
        ("max_iterations por defecto", meta["max_iteraciones_por_defecto"]),
        ("max_iterations_cap", meta["max_iteraciones_cap"]),
        ("Serie de resistencias / capacitores", f"{meta['serie_resistencias']} / {meta['serie_capacitores']}"),
        ("Temperatura del LLM (rutas con LLM)", meta["temperatura_llm"]),
        ("Configuración final", final_id),
        ("Duración de la corrida (s)", meta.get("duracion_total_s")),
        ("Modelo LLM (capturar para C0/C6/Franco)", None),
        ("Hardware (capturar)", None),
    ]:
        r += 1
        _c(ws, r, 1, k, negrita=True)
        celda = _c(ws, r, 2, v, color=AZUL, centro=True, relleno=_AMARILLO if v is None else None)
        if k.startswith("Tolerancia"):
            celda.number_format = "0%"

    r += 2
    _seccion(ws, r, "Condiciones corridas")
    r += 1
    _encabezado(ws, r, ["ID", "Descripción", "Tolerancia", "Máx. iter.", "Valores", "Repeticiones"])
    vistas = {}
    for c in condiciones:
        vistas.setdefault(c.id, [c, 0])[1] += 1
    for c, n in vistas.values():
        r += 1
        _c(ws, r, 1, c.id, negrita=True)
        _c(ws, r, 2, c.nombre)
        _c(ws, r, 3, c.tolerancia, centro=True, fmt="0.0%")
        _c(ws, r, 4, c.max_iteraciones, centro=True)
        _c(ws, r, 5, "comerciales" if c.comerciales else "ideales", centro=True)
        _c(ws, r, 6, n, centro=True)
    for cid, nombre in [("C0", "LLM solo desde lenguaje natural (captura manual)"),
                        ("C6", "Sistema completo desde lenguaje natural (captura manual)")]:
        r += 1
        _c(ws, r, 1, cid, negrita=True)
        _c(ws, r, 2, nombre)
        for k in range(3, 7):
            _c(ws, r, k)
    _anchos(ws, [36, 46, 12, 11, 13, 13])


def _hoja_diseno(wb):
    ws = wb.create_sheet("Diseno experimental")
    _titulo(ws, "Diseño experimental: una pregunta, un experimento",
            "Base de la sección 'Metodología de evaluación'. Se fija antes de correr.")
    _encabezado(ws, 4, ["ID", "Pregunta", "Variable independiente", "Métricas", "Criterio de éxito", "Dónde está el resultado"])
    for i, fila in enumerate(PREGUNTAS):
        for j, v in enumerate(fila):
            _c(ws, 5 + i, 1 + j, v, negrita=j == 0)
        ws.row_dimensions[5 + i].height = 48
    _anchos(ws, [6, 44, 30, 32, 38, 26])
    ws.freeze_panes = "B5"


def _filas_requisito(casos):
    for caso in casos:
        bloques = {b["id"]: b for b in caso["spec"]["blocks"]}
        for ref in caso["referencia"]:
            yield caso, bloques[ref["requisito"]], ref


def _hoja_banco(wb, casos):
    ws = wb.create_sheet("Banco")
    _titulo(ws, "Banco de casos (una fila por requisito)", "Fuente: evaluacion/banco.yaml")
    _encabezado(ws, 4, ["Caso", "Requisito", "Nivel", "Topología", "Descripción", "Bloques", "Métrica", "Objetivo", "Esperado"])
    r = 4
    for caso, bloque, ref in _filas_requisito(casos):
        r += 1
        vals = [caso["id"], ref["requisito"], NOMBRE_NIVEL.get(caso["nivel"], caso["nivel"]),
                bloque["params"]["circuit_id"], caso["descripcion"].strip(), len(caso["spec"]["blocks"]),
                ref["metrica"], ref["objetivo"], caso["esperado"]]
        for j, v in enumerate(vals):
            _c(ws, r, 1 + j, v, color=AZUL if j == 7 else NEGRO, centro=j not in (4,))
    fin = r
    ws.auto_filter.ref = f"A4:I{fin}"
    ws.freeze_panes = "B5"
    r += 2
    _seccion(ws, r, "Cobertura por nivel")
    r += 1
    _encabezado(ws, r, ["Nivel", "Requisitos", "Casos"])
    inicio = r + 1
    for n in NIVELES:
        r += 1
        nombre = NOMBRE_NIVEL[n]
        _c(ws, r, 1, nombre, negrita=True)
        _c(ws, r, 2, f'=COUNTIF($C$5:$C${fin},A{r})', centro=True)
        _c(ws, r, 3, sum(1 for c in casos if c["nivel"] == n), color=AZUL, centro=True)
    r += 1
    _c(ws, r, 1, "Total", negrita=True, relleno=_SUB)
    _c(ws, r, 2, f"=SUM(B{inicio}:B{r - 1})", centro=True, relleno=_SUB, negrita=True)
    _c(ws, r, 3, f"=SUM(C{inicio}:C{r - 1})", centro=True, relleno=_SUB, negrita=True)
    _anchos(ws, [30, 11, 12, 30, 52, 8, 13, 13, 11])


# Columnas de 'Resultados'. Se nombran para que las fórmulas del resumen no
# dependan de contar letras a mano.
_RES = ["Condición", "Tolerancia", "Máx. iter.", "Valores", "Repetición", "Caso", "Requisito", "Nivel",
        "Esperado", "Métrica", "Objetivo", "Medido", "Iteraciones", "Veredicto", "Segundos",
        "APE (%)", "Cumple", "Correcto", "Modo de falla", "Razón del curador"]
COL = {nombre: L(i + 1) for i, nombre in enumerate(_RES)}


def _hoja_resultados(wb, filas):
    ws = wb.create_sheet("Resultados")
    _titulo(ws, "Resultados por condición, repetición y requisito",
            "Capturados por el corredor. APE, Cumple y Correcto son fórmulas; Modo de falla lo asigna clasificar_falla().")
    _encabezado(ws, 4, _RES)
    r = 4
    for f in filas:
        r += 1
        datos = [f["condicion"], f["tolerancia"], f["max_iteraciones"], "comerciales" if f["comerciales"] else "ideales",
                 f["repeticion"], f["caso"], f["requisito"], NOMBRE_NIVEL.get(f["nivel"], f["nivel"]), f["esperado"],
                 f.get("metrica") or "", f["objetivo"], f["medido"], f["iteraciones"], f["estado"],
                 round(f["segundos"], 4)]
        for j, v in enumerate(datos):
            celda = _c(ws, r, 1 + j, v, color=AZUL, centro=True)
            if j == 1:
                celda.number_format = "0.0%"
        m, o, t, it, ver, esp = COL["Medido"], COL["Objetivo"], COL["Tolerancia"], COL["Iteraciones"], COL["Veredicto"], COL["Esperado"]
        ape, cum = COL["APE (%)"], COL["Cumple"]
        _c(ws, r, 16, f'=IF({m}{r}="","",ABS({m}{r}-{o}{r})/ABS({o}{r})*100)', centro=True, fmt="0.000")
        _c(ws, r, 17, f'=IF({m}{r}="",0,IF({ape}{r}<={t}{r}*100,1,0))', centro=True)
        _c(ws, r, 18, f'=IF({esp}{r}="rejected",IF({ver}{r}="rejected",1,0),{cum}{r})', centro=True)
        _c(ws, r, 19, f["modo_falla"], color=AZUL)
        _c(ws, r, 20, f.get("razon", ""), color=AZUL)
        del it
    ws.freeze_panes = "G5"
    ws.auto_filter.ref = f"A4:{L(len(_RES))}{r}"
    _anchos(ws, [14, 10, 9, 12, 10, 30, 10, 11, 10, 13, 12, 12, 10, 11, 9, 9, 8, 9, 34, 48])
    return r


def _rango(nombre, fin):
    c = COL[nombre]
    return f"Resultados!${c}$5:${c}${fin}"


def _hoja_resumen(wb, filas, condiciones, final_id, fin, repetibilidad):
    ws = wb.create_sheet("Resumen", 1)
    _titulo(ws, "Resumen — tablas del capítulo de Pruebas y Resultados",
            "Todo es fórmula sobre 'Resultados' (solo repetición 1). Solve rate excluye los casos negativos.")
    R = {k: _rango(k, fin) for k in _RES}
    final = next(c for c in condiciones if c.id == final_id)
    ws["A3"], ws["B3"] = "Configuración final → tolerancia", final.tolerancia
    ws["C3"], ws["D3"] = "máx. iter.", final.max_iteraciones
    for k in ("A3", "C3"):
        ws[k].font = _font(True)
    for k in ("B3", "D3"):
        ws[k].font = _font(color=AZUL)
        ws[k].fill = _AMARILLO
        ws[k].border = _CAJA
    ws["B3"].number_format = "0.0%"
    ws["E3"] = "← cambia estas dos celdas para ver las tablas D y F de otra condición"
    ws["E3"].font = _font(cursiva=True, color="555555")

    comerciales = [c for c in condiciones if c.comerciales and c.repeticion == 1]
    tols = sorted({c.tolerancia for c in comerciales}, reverse=True)
    iters = sorted({c.max_iteraciones for c in comerciales})
    base = f'{R["Valores"]},"comerciales",{R["Repetición"]},1,{R["Nivel"]},"<>Negativo"'

    def grilla(fila, titulo, columna, fmt):
        _seccion(ws, fila, titulo)
        fila += 1
        _encabezado(ws, fila, ["Tolerancia"] + [f"≤{i} iter." for i in iters])
        for t in tols:
            fila += 1
            _c(ws, fila, 1, t, negrita=True, fmt="0.0%", centro=True)
            for j, it in enumerate(iters):
                v = (f'=IFERROR(AVERAGEIFS({R[columna]},{R["Tolerancia"]},$A{fila},'
                     f'{R["Máx. iter."]},{it},{base}),"")')
                _c(ws, fila, 2 + j, v, centro=True, fmt=fmt)
        return fila + 2

    r = 5
    r = grilla(r, "Tabla A · Solve rate por tolerancia × iteraciones (P2)", "Cumple", "0.0%")
    r = grilla(r, "Tabla B · MAPE (%) por tolerancia × iteraciones (P2)", "APE (%)", "0.000")
    r = grilla(r, "Tabla C · Iteraciones medias consumidas (P2)", "Iteraciones", "0.00")

    _seccion(ws, r, "Tabla D · Por nivel en la configuración seleccionada (P1, P6)")
    r += 1
    _encabezado(ws, r, ["Nivel", "Requisitos", "Solve rate", "Rechazo correcto", "MAPE (%)", "Iter. medias", "Tiempo medio (s)"])
    sel = f'{R["Tolerancia"]},$B$3,{R["Máx. iter."]},$D$3,{R["Valores"]},"comerciales",{R["Repetición"]},1'
    for n in NIVELES + ("total",):
        r += 1
        nombre = "Total (sin negativos)" if n == "total" else NOMBRE_NIVEL[n]
        crit = f'{R["Nivel"]},"<>Negativo"' if n == "total" else f'{R["Nivel"]},"{nombre}"'
        _c(ws, r, 1, nombre, negrita=True, relleno=_SUB if n == "total" else None)
        _c(ws, r, 2, f"=COUNTIFS({sel},{crit})", centro=True)
        negativo = n == "negativo"
        _c(ws, r, 3, "" if negativo else f'=IFERROR(AVERAGEIFS({R["Cumple"]},{sel},{crit}),"")', centro=True, fmt="0.0%")
        _c(ws, r, 4, f'=IFERROR(AVERAGEIFS({R["Correcto"]},{sel},{crit}),"")' if negativo else "", centro=True, fmt="0.0%")
        _c(ws, r, 5, "" if negativo else f'=IFERROR(AVERAGEIFS({R["APE (%)"]},{sel},{crit}),"")', centro=True, fmt="0.000")
        _c(ws, r, 6, f'=IFERROR(AVERAGEIFS({R["Iteraciones"]},{sel},{crit}),"")', centro=True, fmt="0.00")
        _c(ws, r, 7, f'=IFERROR(AVERAGEIFS({R["Segundos"]},{sel},{crit}),"")', centro=True, fmt="0.000")
    r += 2

    ideales = [c for c in condiciones if not c.comerciales]
    if ideales:
        it_i = ideales[0].max_iteraciones
        _seccion(ws, r, f"Tabla E · Valores comerciales vs. teóricos, ≤{it_i} iter. (P4)")
        r += 1
        _encabezado(ws, r, ["Tolerancia", "Solve comerciales", "Solve ideales", "Δ solve", "MAPE comerciales", "MAPE ideales", "Δ MAPE"])
        for t in tols:
            r += 1
            _c(ws, r, 1, t, negrita=True, fmt="0.0%", centro=True)
            for j, (col, valores) in enumerate([("Cumple", "comerciales"), ("Cumple", "ideales"),
                                                 (None, None), ("APE (%)", "comerciales"), ("APE (%)", "ideales")]):
                if col is None:
                    _c(ws, r, 4, f'=IFERROR(B{r}-C{r},"")', centro=True, fmt="+0.0%;-0.0%;0.0%")
                    continue
                v = (f'=IFERROR(AVERAGEIFS({R[col]},{R["Tolerancia"]},$A{r},{R["Máx. iter."]},{it_i},'
                     f'{R["Valores"]},"{valores}",{R["Repetición"]},1,{R["Nivel"]},"<>Negativo"),"")')
                _c(ws, r, 2 + j, v, centro=True, fmt="0.0%" if col == "Cumple" else "0.000")
            _c(ws, r, 7, f'=IFERROR(E{r}-F{r},"")', centro=True, fmt="+0.000;-0.000;0.000")
        r += 2

    _seccion(ws, r, "Tabla F · Modos de falla en la configuración seleccionada")
    r += 1
    _encabezado(ws, r, ["Modo de falla", "Requisitos"])
    for modo in MODOS_DE_FALLA:
        r += 1
        _c(ws, r, 1, modo)
        _c(ws, r, 2, f'=COUNTIFS({sel},{R["Modo de falla"]},A{r})', centro=True)
    r += 2

    r = grilla(r, "Tabla G · Tiempo medio por caso (s) (P7)", "Segundos", "0.000")

    _seccion(ws, r, "Tabla H · Repetibilidad (P8, RNF-02.1)")
    r += 1
    _encabezado(ws, r, ["Indicador", "Valor"])
    for k, v in [("Condición repetida", final_id), ("Corridas", repetibilidad["repeticiones"]),
                 ("Requisitos comparados", repetibilidad["requisitos_comparados"]),
                 ("Requisitos con diferencias", repetibilidad["diferencias"])]:
        r += 1
        _c(ws, r, 1, k, negrita=True)
        _c(ws, r, 2, v, color=AZUL, centro=True)
    _anchos(ws, [40, 16, 16, 16, 16, 16, 16])


def _hoja_linea_base(wb, casos):
    ws = wb.create_sheet("Linea base NL")
    _titulo(ws, "P3 · LLM solo (C0) vs. sistema desde lenguaje natural (C6) — Pass@k",
            "Por corrida: 1 si el circuito simulado cumple la meta, 0 si no. "
            "Pass@k = 1 − C(n−c, k)/C(n, k) (Chen et al., 2021; AnalogCoder).")
    ws["A3"], ws["B3"] = "n (corridas por caso)", 5
    ws["A3"].font = _font(True)
    ws["B3"].font = _font(color=AZUL)
    _encabezado(ws, 5, ["Caso", "Requisito", "Nivel"])
    bloques = {}
    col = 4
    for cid, nombre in [("C0", "LLM solo"), ("C6", "Sistema completo (NL)")]:
        ws.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 7)
        celda = ws.cell(row=4, column=col, value=f"{cid} · {nombre}")
        celda.font, celda.fill, celda.alignment = _font(True, _NAVY), _SUB, _CENTRO
        _encabezado(ws, 5, ["Corr. 1", "Corr. 2", "Corr. 3", "Corr. 4", "Corr. 5", "c", "Pass@1", "Pass@3"], inicio=col)
        bloques[cid] = col
        col += 8
    r = 5
    for caso, _, ref in _filas_requisito(casos):
        if caso["nivel"] == "negativo":
            continue
        r += 1
        _c(ws, r, 1, caso["id"], centro=True)
        _c(ws, r, 2, ref["requisito"], centro=True)
        _c(ws, r, 3, NOMBRE_NIVEL.get(caso["nivel"], caso["nivel"]), centro=True)
        for c0 in bloques.values():
            rango = f"{L(c0)}{r}:{L(c0 + 4)}{r}"
            for k in range(5):
                _c(ws, r, c0 + k, color=AZUL, relleno=_AMARILLO, centro=True)
            cc = L(c0 + 5)
            _c(ws, r, c0 + 5, f'=IF(COUNT({rango})=0,"",SUM({rango}))', centro=True)
            for off, k in ((6, 1), (7, 3)):
                _c(ws, r, c0 + off,
                   f'=IF({cc}{r}="","",IF($B$3-{cc}{r}<{k},1,1-COMBIN($B$3-{cc}{r},{k})/COMBIN($B$3,{k})))',
                   centro=True, fmt="0.00")
    fin = r
    dv = DataValidation(type="whole", operator="between", formula1="0", formula2="1", allow_blank=True)
    ws.add_data_validation(dv)
    for c0 in bloques.values():
        dv.add(f"{L(c0)}6:{L(c0 + 4)}{fin}")
    r += 2
    _seccion(ws, r, "Agregado")
    r += 1
    _encabezado(ws, r, ["Indicador", "C0", "C6"])
    for nombre, off in [("Pass@1 medio", 6), ("Pass@3 medio", 7)]:
        r += 1
        _c(ws, r, 1, nombre, negrita=True)
        for j, c0 in enumerate(bloques.values()):
            _c(ws, r, 2 + j, f'=IFERROR(AVERAGE({L(c0 + off)}6:{L(c0 + off)}{fin}),"")', centro=True, fmt="0.00")
    _anchos(ws, [30, 10, 11] + [7, 7, 7, 7, 7, 6, 8, 8] * 2)
    ws.freeze_panes = "D6"


def _hoja_franco(wb):
    try:
        from agents.analisis.biblioteca import cargar
        problemas = [p["id"] for p in cargar()]
    except Exception:  # la biblioteca es opcional para la matriz
        problemas = []
    ws = wb.create_sheet("Franco")
    _titulo(ws, "P5 · Interpretación de lenguaje natural — biblioteca Franco",
            "python -m agents.evaluacion.franco --usuario <id> --ids ...  · Por corrida 0/1; Aprobado = los tres.")
    _encabezado(ws, 5, ["Problema"])
    col, bloques = 2, []
    for k in range(1, 4):
        ws.merge_cells(start_row=4, start_column=col, end_row=4, end_column=col + 3)
        celda = ws.cell(row=4, column=col, value=f"Corrida {k}")
        celda.font, celda.fill, celda.alignment = _font(True, _NAVY), _SUB, _CENTRO
        _encabezado(ws, 5, ["Modo", "Valores", "ngspice", "Aprobado"], inicio=col)
        bloques.append(col)
        col += 4
    _encabezado(ws, 5, ["c", "Pass@1"], inicio=col)
    cc = col
    r = 5
    for p in problemas:
        r += 1
        _c(ws, r, 1, p, centro=True)
        aprobados = []
        for c0 in bloques:
            for k in range(3):
                _c(ws, r, c0 + k, color=AZUL, relleno=_AMARILLO, centro=True)
            rango = f"{L(c0)}{r}:{L(c0 + 2)}{r}"
            _c(ws, r, c0 + 3, f'=IF(COUNT({rango})<3,"",MIN({rango}))', centro=True)
            aprobados.append(f"{L(c0 + 3)}{r}")
        lista = ",".join(aprobados)
        _c(ws, r, cc, f'=IF(COUNT({lista})=0,"",SUM({lista}))', centro=True)
        _c(ws, r, cc + 1, f'=IF({L(cc)}{r}="","",{L(cc)}{r}/COUNT({lista}))', centro=True, fmt="0.00")
    fin = r
    if problemas:
        r += 2
        _seccion(ws, r, "Agregado")
        for nombre, off in [("% modo correcto", 0), ("% valores correctos", 1), ("% reproducido por ngspice", 2), ("% aprobado", 3)]:
            r += 1
            _c(ws, r, 1, nombre, negrita=True, relleno=_SUB)
            partes = ",".join(f"{L(c0 + off)}6:{L(c0 + off)}{fin}" for c0 in bloques)
            _c(ws, r, 2, f'=IFERROR(AVERAGE({partes}),"")', centro=True, fmt="0.0%")
    _anchos(ws, [20] + [7, 8, 8, 9] * 3 + [6, 8])
    ws.freeze_panes = "B6"


def _hoja_trazabilidad(wb):
    ws = wb.create_sheet("Trazabilidad SRS")
    _titulo(ws, "Requisito → prueba → resultado",
            "Mapeo inferido de nombres de archivo y módulos: confirmar cada fila antes de citarla.")
    _encabezado(ws, 4, ["ID", "Requisito", "Verificado por", "Método", "Resultado", "Evidencia"])
    for i, (rid, nombre, verif, metodo) in enumerate(TRAZABILIDAD):
        r = 5 + i
        pendiente = metodo == "Pendiente" or verif.startswith(("Sin prueba", "Por confirmar"))
        _c(ws, r, 1, rid, negrita=True)
        _c(ws, r, 2, nombre)
        _c(ws, r, 3, verif, color=ROJO if pendiente else NEGRO)
        _c(ws, r, 4, metodo, color=ROJO if pendiente else NEGRO, centro=True)
        _c(ws, r, 5, color=AZUL, relleno=_AMARILLO, centro=True)
        _c(ws, r, 6, color=AZUL, relleno=_AMARILLO)
    fin = 4 + len(TRAZABILIDAD)
    dv = DataValidation(type="list", formula1='"Cumple,Parcial,No cumple,Pendiente"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"E5:E{fin}")
    r = fin + 2
    _seccion(ws, r, "Avance")
    for k in ["Cumple", "Parcial", "No cumple", "Pendiente"]:
        r += 1
        _c(ws, r, 1, k, negrita=True)
        _c(ws, r, 2, f'=COUNTIF($E$5:$E${fin},A{r})', centro=True)
    r += 1
    _c(ws, r, 1, "Sin capturar", negrita=True)
    _c(ws, r, 2, f"=COUNTBLANK($E$5:$E${fin})", centro=True)
    _anchos(ws, [10, 36, 48, 22, 12, 34])
    ws.freeze_panes = "C5"


def _hoja_unitarias(wb):
    ws = wb.create_sheet("Pruebas unitarias")
    _titulo(ws, "Inventario de verificación de software",
            "Conteo de funciones de prueba por archivo en el árbol de la corrida. 'Pasan' se captura de pytest / bun test.")
    _encabezado(ws, 4, ["Archivo", "Suite", "Pruebas", "Pasan", "Fallan"])
    filas = contar_pruebas()
    for i, (archivo, suite, n) in enumerate(filas):
        r = 5 + i
        _c(ws, r, 1, archivo)
        _c(ws, r, 2, suite, centro=True)
        celda = _c(ws, r, 3, n, color=AZUL, centro=True)
        if n == 0:
            celda.comment = Comment("No se encontró ninguna función de prueba con el patrón usual; revisar.", "matriz")
        _c(ws, r, 4, color=AZUL, relleno=_AMARILLO, centro=True)
        _c(ws, r, 5, f'=IF(D{r}="","",C{r}-D{r})', centro=True)
    fin = 4 + len(filas)
    r = fin + 1
    _c(ws, r, 1, "Total", negrita=True, relleno=_SUB)
    _c(ws, r, 2, f"=COUNTA(A5:A{fin})", centro=True, relleno=_SUB)
    _c(ws, r, 3, f"=SUM(C5:C{fin})", centro=True, relleno=_SUB, negrita=True)
    _c(ws, r, 4, f"=SUM(D5:D{fin})", centro=True, relleno=_SUB, negrita=True)
    _c(ws, r, 5, f'=IF(D{r}=0,"",C{r}-D{r})', centro=True, relleno=_SUB, negrita=True)
    _anchos(ws, [52, 18, 9, 9, 9])
    ws.freeze_panes = "A5"


def construir_matriz(filas, casos, condiciones, meta, *, final_id, repetibilidad):
    wb = Workbook()
    _hoja_leeme(wb, meta, condiciones, final_id)
    _hoja_diseno(wb)
    fin = _hoja_resultados(wb, filas)
    _hoja_resumen(wb, filas, condiciones, final_id, fin, repetibilidad)
    _hoja_banco(wb, casos)
    _hoja_linea_base(wb, casos)
    _hoja_franco(wb)
    _hoja_trazabilidad(wb)
    _hoja_unitarias(wb)
    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False
    # openpyxl no guarda valores calculados: se le pide a Excel/LibreOffice que
    # recalcule todo al abrir.
    wb.calculation.fullCalcOnLoad = True
    return wb
