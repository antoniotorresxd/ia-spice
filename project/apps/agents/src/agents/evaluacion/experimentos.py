"""Corre el diseño experimental completo y deja los resultados listos para la tesina.

    uv run python -m agents.evaluacion.experimentos
    uv run python -m agents.evaluacion.experimentos --solo-final     # una corrida rápida
    uv run python -m agents.evaluacion.experimentos --sin-xlsx       # solo CSV y LaTeX

Lee las condiciones de `evaluacion/experimentos.yaml`, corre el banco en cada
una y escribe en `evaluacion/resultados/<fecha>/`:

- `filas.csv`     — una fila por condición × repetición × requisito (los datos crudos)
- `resumen.csv`   — solve rate, MAPE, iteraciones y tiempo por condición y nivel
- `tablas.tex`    — las tablas del capítulo, pegables con \\input
- `matriz.xlsx`   — la matriz de pruebas con los resultados ya capturados

Todo va por la ruta estructurada (`circuit_spec`), sin LLM: la medición no
depende de una API ni hereda su variabilidad. Las condiciones con LLM (línea
base y lenguaje natural) quedan como hojas a capturar en la matriz.
"""

import argparse
import copy
import csv
import os
import subprocess
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import yaml

from agents import config as config_mod
from agents.evaluacion.banco import NIVELES, cargar_banco
from agents.evaluacion.corredor import correr_caso
from agents.evaluacion.metricas import mape
from agents.graph import build_graph

RAIZ = Path(__file__).resolve().parents[3]
EXPERIMENTOS_POR_DEFECTO = RAIZ / "evaluacion" / "experimentos.yaml"
RESULTADOS = RAIZ / "evaluacion" / "resultados"

# Modos de falla. Se asignan con reglas sobre el veredicto y la medición, no a
# mano: así la tabla de fallas es reproducible y no depende de quién la llene.
NINGUNA = "Ninguna"
FUERA_DE_TOLERANCIA_ACEPTADO = "Aceptado fuera de tolerancia"
AGOTO_ITERACIONES = "Fuera de tolerancia al agotar iteraciones"
RECHAZO_TEMPRANO = "Rechazado antes de agotar iteraciones"
OTRO_BLOQUE = "En tolerancia, pero otro bloque del caso falló"
ERROR_SIMULACION = "Error de simulación"
SIN_METRICA = "Métrica no medida"
RECHAZO_CORRECTO = "Rechazo correcto"
META_IMPOSIBLE_ACEPTADA = "Aceptó una meta imposible"

MODOS_DE_FALLA = (
    NINGUNA,
    FUERA_DE_TOLERANCIA_ACEPTADO,
    AGOTO_ITERACIONES,
    RECHAZO_TEMPRANO,
    OTRO_BLOQUE,
    ERROR_SIMULACION,
    SIN_METRICA,
    RECHAZO_CORRECTO,
    META_IMPOSIBLE_ACEPTADA,
)


@dataclass(frozen=True)
class Condicion:
    id: str
    tolerancia: float
    max_iteraciones: int
    comerciales: bool = True
    repeticion: int = 1

    @property
    def nombre(self) -> str:
        valores = "comerciales" if self.comerciales else "ideales"
        return f"tol {self.tolerancia * 100:g} %, ≤{self.max_iteraciones} iter, valores {valores}"


def _id(tol: float, it: int, comerciales: bool) -> str:
    return f"t{tol * 100:g}-i{it}" + ("" if comerciales else "-ideal")


def cargar_condiciones(path: str | Path | None = None, *, solo_final: bool = False) -> list[Condicion]:
    resolved = Path(path) if path is not None else EXPERIMENTOS_POR_DEFECTO
    with resolved.open(encoding="utf-8") as handle:
        plan = yaml.safe_load(handle) or {}

    final = plan["final"]
    if solo_final:
        return [Condicion(_id(final["tolerancia"], final["max_iteraciones"], True),
                          final["tolerancia"], final["max_iteraciones"])]

    condiciones = [
        Condicion(_id(tol, it, True), tol, it)
        for tol in plan["barrido"]["tolerancias"]
        for it in plan["barrido"]["max_iteraciones"]
    ]
    if "ideal" in plan:
        it = plan["ideal"]["max_iteraciones"]
        condiciones += [Condicion(_id(tol, it, False), tol, it, comerciales=False)
                        for tol in plan["barrido"]["tolerancias"]]

    final_id = _id(final["tolerancia"], final["max_iteraciones"], True)
    if final_id not in {c.id for c in condiciones}:
        condiciones.append(Condicion(final_id, final["tolerancia"], final["max_iteraciones"]))
    condiciones += [
        Condicion(final_id, final["tolerancia"], final["max_iteraciones"], repeticion=k)
        for k in range(2, 2 + plan.get("repeticiones_repetibilidad", 0))
    ]
    return condiciones


@contextmanager
def configuracion(*, comerciales: bool):
    """Aplica la configuración de una condición durante la corrida.

    Parte de la config vigente (la de CURADOR_CONFIG_PATH si está definida) y
    solo cambia lo que la condición controla. Se restaura al salir, también si
    la corrida revienta, para que una condición no contamine a la siguiente.
    """
    base = config_mod.load_config(os.environ.get("CURADOR_CONFIG_PATH"))
    cfg = copy.deepcopy(base)
    if not comerciales:
        cfg.setdefault("comerciales", {})["habilitado"] = False
    previa = config_mod._cache
    config_mod._cache = cfg
    try:
        yield cfg
    finally:
        config_mod._cache = previa


def clasificar_falla(fila: dict, max_iteraciones: int) -> str:
    """Modo de falla de un requisito. Función pura para poder probarla sola."""
    if fila["esperado"] == "rejected":
        return RECHAZO_CORRECTO if fila["estado"] == "rejected" else META_IMPOSIBLE_ACEPTADA
    if fila["en_tolerancia"]:
        return NINGUNA if fila["estado"] == "accepted" else OTRO_BLOQUE
    if fila["medido"] is None:
        return ERROR_SIMULACION if fila.get("sim_error") else SIN_METRICA
    if fila["estado"] == "accepted":
        return FUERA_DE_TOLERANCIA_ACEPTADO
    if fila["iteraciones"] < max_iteraciones:
        return RECHAZO_TEMPRANO
    return AGOTO_ITERACIONES


def es_correcto(fila: dict) -> bool:
    """Acierto de un requisito: cumplir la meta o, si la meta es imposible,
    rechazarla. El solve rate usa solo `en_tolerancia` de los no negativos."""
    if fila["esperado"] == "rejected":
        return fila["estado"] == "rejected"
    return bool(fila["en_tolerancia"])


def correr_condicion(casos: list[dict], cond: Condicion, *, avisar=None) -> list[dict]:
    filas = []
    with configuracion(comerciales=cond.comerciales):
        graph = build_graph()
        for caso in casos:
            inicio = time.perf_counter()
            resultados = correr_caso(
                caso,
                tolerancia=cond.tolerancia,
                max_iteraciones=cond.max_iteraciones,
                graph=graph,
                thread_id=f"exp-{cond.id}-r{cond.repeticion}-{caso['id']}",
            )
            segundos = time.perf_counter() - inicio
            for fila in resultados:
                fila.update(
                    condicion=cond.id,
                    tolerancia=cond.tolerancia,
                    max_iteraciones=cond.max_iteraciones,
                    comerciales=cond.comerciales,
                    repeticion=cond.repeticion,
                    caso=caso["id"],
                    requisito=fila["id"].split("/")[-1] if "/" in fila["id"] else caso["referencia"][0]["requisito"],
                    # Tiempo del caso completo: un caso compuesto se simula una
                    # sola vez, así que sus dos filas comparten el mismo tiempo.
                    segundos=segundos,
                    modo_falla=clasificar_falla(fila, cond.max_iteraciones),
                    correcto=es_correcto(fila),
                )
                filas.append(fila)
    if avisar:
        avisar(cond, filas)
    return filas


def resumir_por_nivel(filas: list[dict]) -> list[dict]:
    """Una fila por condición × nivel, más el total sin negativos. Solo la
    repetición 1: las demás existen para la prueba de repetibilidad."""
    filas = [f for f in filas if f["repeticion"] == 1]
    condiciones = list(dict.fromkeys(f["condicion"] for f in filas))
    resumen = []
    for cond in condiciones:
        de_cond = [f for f in filas if f["condicion"] == cond]
        muestra = de_cond[0]
        grupos = [(n, [f for f in de_cond if f["nivel"] == n]) for n in NIVELES]
        grupos.append(("total", [f for f in de_cond if f["nivel"] != "negativo"]))
        for nivel, grupo in grupos:
            if not grupo:
                continue
            negativos = nivel == "negativo"
            apes = [f["ape"] for f in grupo if f["ape"] is not None]
            resumen.append({
                "condicion": cond,
                "tolerancia": muestra["tolerancia"],
                "max_iteraciones": muestra["max_iteraciones"],
                "comerciales": muestra["comerciales"],
                "nivel": nivel,
                "requisitos": len(grupo),
                "solve_rate": None if negativos else sum(f["en_tolerancia"] for f in grupo) / len(grupo),
                "tasa_aceptada": sum(f["estado"] == "accepted" for f in grupo) / len(grupo),
                "rechazo_correcto": sum(f["estado"] == "rejected" for f in grupo) / len(grupo) if negativos else None,
                "mape": None if negativos else mape(apes),
                "iteraciones_medias": sum(f["iteraciones"] for f in grupo) / len(grupo),
                "segundos_medios": sum(f["segundos"] for f in grupo) / len(grupo),
            })
    return resumen


def repetibilidad(filas: list[dict]) -> dict:
    """Compara las repeticiones de cada condición repetida. La ruta
    estructurada es determinista: cualquier diferencia es un hallazgo."""
    por_clave: dict[tuple, dict[int, tuple]] = {}
    for f in filas:
        clave = (f["condicion"], f["id"])
        por_clave.setdefault(clave, {})[f["repeticion"]] = (f["medido"], f["iteraciones"], f["estado"])
    repetidas = {k: v for k, v in por_clave.items() if len(v) > 1}
    distintas = [k for k, v in repetidas.items() if len(set(v.values())) > 1]
    return {
        "requisitos_comparados": len(repetidas),
        "repeticiones": max((len(v) for v in repetidas.values()), default=1),
        "diferencias": len(distintas),
        "casos_distintos": [f"{c}:{i}" for c, i in distintas],
    }


COLUMNAS_FILAS = (
    "condicion", "tolerancia", "max_iteraciones", "comerciales", "repeticion",
    "caso", "requisito", "id", "nivel", "tipo", "esperado", "objetivo", "medido",
    "ape", "en_tolerancia", "correcto", "iteraciones", "estado", "modo_falla",
    "segundos", "razon", "sim_error",
)


def escribir_csv(path: Path, filas: list[dict], columnas) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columnas), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(filas)


def metadatos() -> dict:
    """Lo que hace falta para reproducir la corrida (sección Configuración
    experimental del capítulo)."""
    def _cmd(*args) -> str:
        try:
            out = subprocess.run(args, capture_output=True, text=True, timeout=10)
            return (out.stdout or out.stderr).strip().splitlines()[0]
        except (OSError, subprocess.SubprocessError, IndexError):
            return "no disponible"

    cfg = config_mod.get_config()
    return {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "commit": _cmd("git", "-C", str(RAIZ), "rev-parse", "--short", "HEAD"),
        "ngspice": _cmd("ngspice", "--version"),
        "tolerancia_por_defecto": cfg["curador"]["tolerance"],
        "max_iteraciones_por_defecto": cfg["curador"]["max_iterations"],
        "max_iteraciones_cap": cfg["curador"]["max_iterations_cap"],
        "serie_resistencias": cfg.get("comerciales", {}).get("serie_resistencias"),
        "serie_capacitores": cfg.get("comerciales", {}).get("serie_capacitores"),
        "temperatura_llm": cfg.get("llm", {}).get("temperature"),
    }


def correr_todo(casos: list[dict], condiciones: list[Condicion], *, avisar=None) -> list[dict]:
    return [fila for cond in condiciones for fila in correr_condicion(casos, cond, avisar=avisar)]


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.evaluacion.experimentos")
    parser.add_argument("--banco", default=None, help="ruta a un banco propio")
    parser.add_argument("--experimentos", default=None, help="ruta a un plan de condiciones propio")
    parser.add_argument("--solo-final", action="store_true", help="solo la configuración final")
    parser.add_argument("--salida", default=None, help="carpeta de salida")
    parser.add_argument("--sin-xlsx", action="store_true", help="no genera matriz.xlsx")
    args = parser.parse_args()

    casos = cargar_banco(args.banco)
    condiciones = cargar_condiciones(args.experimentos, solo_final=args.solo_final)
    salida = Path(args.salida) if args.salida else RESULTADOS / datetime.now().strftime("%Y%m%d-%H%M%S")
    salida.mkdir(parents=True, exist_ok=True)

    def avisar(cond: Condicion, filas: list[dict]) -> None:
        resueltos = [f for f in filas if f["nivel"] != "negativo"]
        tasa = sum(f["en_tolerancia"] for f in resueltos) / len(resueltos) if resueltos else 0
        print(f"{cond.id:<16} rep {cond.repeticion}  solve rate {tasa * 100:5.1f} %", flush=True)

    inicio = time.perf_counter()
    filas = correr_todo(casos, condiciones, avisar=avisar)
    meta = metadatos()
    meta["duracion_total_s"] = round(time.perf_counter() - inicio, 1)
    resumen = resumir_por_nivel(filas)
    rep = repetibilidad(filas)

    escribir_csv(salida / "filas.csv", filas, COLUMNAS_FILAS)
    escribir_csv(salida / "resumen.csv", resumen, resumen[0].keys())

    from agents.evaluacion.reporte import tablas_experimentos_latex

    final = cargar_condiciones(args.experimentos, solo_final=True)[0]
    (salida / "tablas.tex").write_text(
        tablas_experimentos_latex(filas, resumen, final_id=final.id, repetibilidad=rep), encoding="utf-8"
    )

    if not args.sin_xlsx:
        from agents.evaluacion.matriz import construir_matriz

        wb = construir_matriz(filas, casos, condiciones, meta, final_id=final.id, repetibilidad=rep)
        wb.save(salida / "matriz.xlsx")

    print(f"\nRepetibilidad: {rep['diferencias']} diferencias en {rep['requisitos_comparados']} requisitos "
          f"comparados ({rep['repeticiones']} corridas)")
    print(f"Resultados en {salida}  ({meta['duracion_total_s']} s)")


if __name__ == "__main__":
    main()
