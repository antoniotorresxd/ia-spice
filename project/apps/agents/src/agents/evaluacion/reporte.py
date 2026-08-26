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
