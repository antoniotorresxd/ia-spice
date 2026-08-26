"""Corre la evaluación completa:

    uv run python -m agents.evaluacion

Escribe el reporte en markdown por stdout y, con --latex, la tabla lista para
el capítulo de pruebas.
"""

import argparse

from agents.evaluacion.banco import cargar_banco
from agents.evaluacion.corredor import correr_banco
from agents.evaluacion.metricas import resumir
from agents.evaluacion.reporte import tabla_latex, tabla_markdown


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.evaluacion")
    parser.add_argument("--banco", default=None, help="ruta a un banco propio")
    parser.add_argument("--latex", action="store_true", help="emite la tabla LaTeX")
    args = parser.parse_args()

    casos = cargar_banco(args.banco)
    resultados = correr_banco(casos)
    resumen = resumir(resultados)

    print(tabla_latex(resultados, resumen) if args.latex else tabla_markdown(resultados, resumen))


if __name__ == "__main__":
    main()
