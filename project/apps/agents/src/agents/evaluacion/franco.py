"""Banco del Franco contra el LLM real: de enunciado a respuesta verificada.

    uv run --env-file .env python -m agents.evaluacion.franco --usuario <user_id> --ids franco-ej1.4,franco-ej1.5

Cada problema de la biblioteca (`analisis/biblioteca/*.yaml`) entra por
`request_text`, como lo escribiría un usuario, y recorre el grafo completo con
el LLM que ese usuario tiene asignado: modo, transcripción, autocorrección,
motor y ngspice. Su propia entrada se excluye de los ejemplos recuperados,
para no darle la respuesta.

Un caso aprueba si (1) se eligió el modo esperado, (2) cada valor de
`esperado` aparece entre las respuestas (por nombre si coincide, si no por
valor: el LLM puede llamar RF a lo que el libro llama Rf) y (3) ngspice
reproduce el planteamiento. Cada caso cuesta una o dos llamadas al LLM: por
eso `--max` (3 por omisión) y `--ids` para correr pocos a la vez.
"""

import argparse
import json
import time
import uuid
from datetime import datetime
from pathlib import Path

import sympy as sp

from agents.analisis.biblioteca import EXCLUIR, cargar
from agents.analisis.planteamiento import _cantidad

RESULTADOS = Path(__file__).resolve().parents[3] / "evaluacion" / "resultados"


def _numero(valor) -> float:
    return float(sp.N(_cantidad(valor)))


def _estado(enunciado: str) -> dict:
    return {
        "circuit_spec": {},
        "request_text": enunciado,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
        "documentation": {},
        "outcome": None,
    }


def _cerca(a: float, b: float, tolerancia: float) -> bool:
    return abs(a - b) <= max(tolerancia * abs(b), 1e-9)


def calificar(entrada: dict, final: dict) -> dict:
    """Compara el estado final del grafo con `esperado`. Función pura, para
    poder probarla sin LLM."""
    outcome = final.get("outcome") or {}
    modo = outcome.get("mode")
    esperado = entrada["esperado"]
    tolerancia = esperado.get("tolerancia", 0.005)
    planteamiento = (outcome.get("resultados") or {}).get("planteamiento") or {}
    incognitas = {k.lower(): v for k, v in (planteamiento.get("incognitas") or {}).items() if isinstance(v, (int, float))}
    valores = list(incognitas.values()) + [
        p["valor"] for p in planteamiento.get("preguntas") or [] if isinstance(p.get("valor"), (int, float))
    ]
    faltan = []
    for clave, valor in [*(esperado.get("incognitas") or {}).items(), *(esperado.get("preguntas") or {}).items()]:
        objetivo = _numero(valor)
        por_nombre = incognitas.get(str(clave).lower())
        if por_nombre is not None and _cerca(por_nombre, objetivo, tolerancia):
            continue
        if not any(_cerca(v, objetivo, tolerancia) for v in valores):
            faltan.append(f"{clave} = {valor}")
    verificado = bool(((outcome.get("resultados") or {}).get("validacion") or {}).get("coincide"))
    modo_ok = modo == entrada.get("modo", "analysis")
    return {
        "id": entrada["id"],
        "modo": modo,
        "modo_ok": modo_ok,
        "faltan": faltan,
        "verificado": verificado,
        "correcciones": len(final.get("correcciones_hechas") or []),
        "error": outcome.get("error") or (final.get("verdict") or {}).get("reason"),
        "aprobado": modo_ok and not faltan and verificado,
    }


def correr_caso(entrada: dict, usuario: str, grafo=None) -> dict:
    from agents.graph import build_graph

    grafo = grafo or build_graph()
    marca = EXCLUIR.set(frozenset({entrada["id"]}))
    inicio = time.perf_counter()
    try:
        final = grafo.invoke(
            _estado(entrada["enunciado"]),
            {"configurable": {"thread_id": f"franco-{entrada['id']}-{uuid.uuid4().hex[:8]}", "user_id": usuario}},
        )
        resultado = calificar(entrada, final)
    except Exception as exc:  # noqa: BLE001 - un caso que revienta se reporta, no corta el banco
        resultado = {"id": entrada["id"], "modo": None, "modo_ok": False, "faltan": [], "verificado": False,
                     "correcciones": 0, "error": f"{type(exc).__name__}: {exc}", "aprobado": False}
    finally:
        EXCLUIR.reset(marca)
    resultado["segundos"] = round(time.perf_counter() - inicio, 1)
    return resultado


def tabla(resultados: list[dict]) -> str:
    aprobados = sum(r["aprobado"] for r in resultados)
    lineas = [
        f"**{aprobados} de {len(resultados)} aprobados**",
        "",
        "| Problema | Modo | Valores del libro | ngspice | Correcciones | |",
        "|---|---|---|---|---|---|",
    ]
    for r in resultados:
        valores = "✓" if not r["faltan"] else "falta " + ", ".join(r["faltan"])
        if r.get("error") and not r["aprobado"]:
            valores += f" ({r['error'][:120]})"
        lineas.append(
            f"| {r['id']} | {r['modo'] or '—'}{'' if r['modo_ok'] else ' ✗'} | {valores} | "
            f"{'✓' if r['verificado'] else '✗'} | {r['correcciones']} | {'✅' if r['aprobado'] else '❌'} |"
        )
    return "\n".join(lineas)


def main() -> None:
    parser = argparse.ArgumentParser(prog="agents.evaluacion.franco")
    parser.add_argument("--usuario", required=True, help="user_id con LLM asignado al orquestador")
    parser.add_argument("--ids", default="", help="ids separados por coma (por omisión, los primeros --max)")
    parser.add_argument("--max", type=int, default=3, help="cuántos casos correr como máximo")
    args = parser.parse_args()

    entradas = list(cargar())
    if args.ids:
        pedidos = [i.strip() for i in args.ids.split(",") if i.strip()]
        desconocidos = set(pedidos) - {e["id"] for e in entradas}
        if desconocidos:
            parser.error(f"ids que no están en la biblioteca: {', '.join(sorted(desconocidos))}")
        entradas = [e for e in entradas if e["id"] in pedidos]
    entradas = entradas[: args.max]

    resultados = []
    for entrada in entradas:
        print(f"→ {entrada['id']} …", flush=True)
        resultados.append(correr_caso(entrada, args.usuario))

    reporte = tabla(resultados)
    print("\n" + reporte)
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    (RESULTADOS / f"franco-{marca}.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=1), encoding="utf-8")
    (RESULTADOS / f"franco-{marca}.md").write_text(reporte + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
