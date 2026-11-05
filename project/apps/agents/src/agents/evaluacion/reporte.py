"""Rinde los resultados en las dos formas que hacen falta: markdown para
leerlos, LaTeX para pegarlos en el capítulo de pruebas."""

SIN_MEDICION = "sin medición"


def _fmt(valor: float | None, decimales: int = 2) -> str:
    return SIN_MEDICION if valor is None else f"{valor:.{decimales}f}"


def tabla_markdown(resultados: list[dict], resumen: dict) -> str:
    lineas = [
        "| Caso | Tipo | Objetivo | Medido | APE (%) | En tolerancia | Iteraciones | Veredicto |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in resultados:
        lineas.append(
            f"| {r['id']} | {r['tipo']} | {_fmt(r['objetivo'], 4)} | "
            f"{_fmt(r['medido'], 4)} | {_fmt(r['ape'])} | "
            f"{'sí' if r['en_tolerancia'] else 'no'} | {r['iteraciones']} | {r['estado']} |"
        )

    lineas += [
        "",
        "## Resumen",
        "",
        f"- Casos: **{resumen['casos']}** ({resumen['medidos']} medidos, "
        f"{resumen['sin_medicion']} sin medición)",
        f"- **MAPE**: {_fmt(resumen['mape'])} % (sobre los casos medidos)",
        f"- **Tasa en tolerancia**: {resumen['tasa_en_tolerancia'] * 100:.1f} % "
        "— la tasa de circuitos que cumplen su meta",
        f"- Tasa aceptada: {resumen['tasa_aceptada'] * 100:.1f} % "
        "— incluye los aceptados por recompensa fuera de tolerancia",
        f"- Iteraciones medias: {resumen['iteraciones_medias']:.2f}",
    ]
    return "\n".join(lineas)


def tabla_latex(resultados: list[dict], resumen: dict) -> str:
    filas = []
    for r in resultados:
        # el guion bajo y el guion medio no necesitan escape dentro de \texttt,
        # pero el id va en \texttt para que se lea como identificador
        filas.append(
            f"\\texttt{{{r['id']}}} & {_fmt(r['objetivo'], 4)} & {_fmt(r['medido'], 4)} & "
            f"{_fmt(r['ape'])} & {'sí' if r['en_tolerancia'] else 'no'} & "
            f"{r['iteraciones']} \\\\"
        )

    cuerpo = "\n".join(filas)
    return (
        "\\begin{tabular}{lrrrcr}\n"
        "\\toprule\n"
        "\\textbf{Caso} & \\textbf{Objetivo} & \\textbf{Medido} & "
        "\\textbf{APE (\\%)} & \\textbf{En tol.} & \\textbf{Iter.} \\\\\n"
        "\\midrule\n"
        f"{cuerpo}\n"
        "\\midrule\n"
        f"\\multicolumn{{6}}{{l}}{{MAPE: {_fmt(resumen['mape'])} \\% — "
        f"tasa en tolerancia: {resumen['tasa_en_tolerancia'] * 100:.1f} \\% — "
        f"tasa aceptada: {resumen['tasa_aceptada'] * 100:.1f} \\% — "
        f"iteraciones medias: {resumen['iteraciones_medias']:.2f}}} \\\\\n"
        "\\bottomrule\n"
        "\\end{tabular}"
    )


# --- Diseño experimental completo (agents.evaluacion.experimentos) ---------

_NOMBRE_NIVEL = {
    "basico": "Básico",
    "intermedio": "Intermedio",
    "avanzado": "Avanzado",
    "limite": "Límite",
    "negativo": "Negativo",
    "total": "Total (sin negativos)",
}


def _pct(valor: float | None) -> str:
    return "--" if valor is None else f"{valor * 100:.1f}\\,\\%"


def _num(valor: float | None, decimales: int = 2) -> str:
    return "--" if valor is None else f"{valor:.{decimales}f}"


def _tol(t: float) -> str:
    return f"{t * 100:g}\\,\\%"


def _tabular(columnas: str, encabezado: list[str], filas: list[list[str]], titulo: str) -> str:
    cuerpo = "\n".join(" & ".join(f) + " \\\\" for f in filas)
    return (
        f"% {titulo}\n"
        f"\\begin{{tabular}}{{{columnas}}}\n\\toprule\n"
        + " & ".join(f"\\textbf{{{e}}}" for e in encabezado) + " \\\\\n\\midrule\n"
        f"{cuerpo}\n\\bottomrule\n\\end{{tabular}}\n"
    )


def tablas_experimentos_latex(filas: list[dict], resumen: list[dict], *, final_id: str, repetibilidad: dict) -> str:
    """Las tablas del capítulo a partir de una corrida de experimentos. Se
    calculan en Python, no se leen de la matriz, para que el .tex no dependa
    de abrir Excel; la prueba de matriz.py comprueba que ambas coinciden."""
    total = {(r["condicion"]): r for r in resumen if r["nivel"] == "total"}
    comerciales = [r for r in total.values() if r["comerciales"]]
    tols = sorted({r["tolerancia"] for r in comerciales}, reverse=True)
    iters = sorted({r["max_iteraciones"] for r in comerciales})

    def celda(tol, it, clave, fmt):
        r = next((r for r in comerciales if r["tolerancia"] == tol and r["max_iteraciones"] == it), None)
        return fmt(r[clave]) if r else "--"

    partes = []
    enc = ["Tolerancia"] + [f"$\\leq${i} iter." for i in iters]
    partes.append(_tabular("l" + "r" * len(iters), enc,
                           [[_tol(t)] + [celda(t, i, "solve_rate", _pct) for i in iters] for t in tols],
                           "Tabla A. Solve rate (sin casos negativos) por tolerancia y presupuesto de iteraciones"))
    partes.append(_tabular("l" + "r" * len(iters), enc,
                           [[_tol(t)] + [celda(t, i, "mape", lambda v: _num(v, 3)) for i in iters] for t in tols],
                           "Tabla B. MAPE (%) por tolerancia y presupuesto de iteraciones"))
    partes.append(_tabular("l" + "r" * len(iters), enc,
                           [[_tol(t)] + [celda(t, i, "iteraciones_medias", _num) for i in iters] for t in tols],
                           "Tabla C. Iteraciones medias consumidas"))

    por_nivel = [r for r in resumen if r["condicion"] == final_id]
    partes.append(_tabular(
        "lrrrrr", ["Nivel", "Req.", "Solve rate", "MAPE (\\%)", "Iter.", "Tiempo (s)"],
        [[_NOMBRE_NIVEL.get(r["nivel"], r["nivel"]), str(r["requisitos"]),
          _pct(r["solve_rate"]) if r["nivel"] != "negativo" else f"rechazo {_pct(r['rechazo_correcto'])}",
          _num(r["mape"], 3), _num(r["iteraciones_medias"]), _num(r["segundos_medios"])] for r in por_nivel],
        f"Tabla D. Resultados por nivel en la configuración final ({final_id})"))

    ideales = {r["tolerancia"]: r for r in total.values() if not r["comerciales"]}
    if ideales:
        it_ideal = next(iter(ideales.values()))["max_iteraciones"]
        filas_ci = []
        for t in tols:
            com = next((r for r in comerciales if r["tolerancia"] == t and r["max_iteraciones"] == it_ideal), None)
            ide = ideales.get(t)
            if com and ide:
                filas_ci.append([_tol(t), _pct(com["solve_rate"]), _pct(ide["solve_rate"]),
                                 _num(com["mape"], 3), _num(ide["mape"], 3)])
        partes.append(_tabular("lrrrr", ["Tolerancia", "Solve com.", "Solve ideal", "MAPE com.", "MAPE ideal"], filas_ci,
                               f"Tabla E. Valores comerciales frente a teóricos ({it_ideal} iteraciones)"))

    finales = [f for f in filas if f["condicion"] == final_id and f["repeticion"] == 1]
    conteo: dict[str, int] = {}
    for f in finales:
        conteo[f["modo_falla"]] = conteo.get(f["modo_falla"], 0) + 1
    partes.append(_tabular("lr", ["Modo", "Requisitos"],
                           [[m, str(n)] for m, n in sorted(conteo.items(), key=lambda kv: -kv[1])],
                           f"Tabla F. Modos de falla en la configuración final ({final_id})"))

    partes.append(
        f"% Repetibilidad (RNF-02.1): {repetibilidad['diferencias']} diferencias en "
        f"{repetibilidad['requisitos_comparados']} requisitos comparados entre "
        f"{repetibilidad['repeticiones']} corridas de {final_id}.\n"
    )
    return "\n".join(partes)
