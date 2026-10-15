"""¿Quedó en el planteamiento todo lo que dice el enunciado?

El LLM declara en `requisitos` cada dato y cada cosa pedida, y dónde la
puso. Aquí se comprueba, sin LLM, que esa declaración sea cierta: una
medición tiene que estar en algún escenario, una pregunta en las
preguntas, un dato en el netlist. Lo que falte vuelve al orquestador como
corrección ("el requisito «Ri2 = 100k» no aparece…"), en vez de que el
sistema resuelva y verifique con ngspice un problema que no es el pedido.

No puede detectar un requisito que el LLM ni siquiera declaró; para eso
la guía le pide listar TODO, incisos incluidos.
"""

import re


def _normal(texto: str) -> str:
    return re.sub(r"\s+", "", texto or "").lower()


def _nombres(outcome: dict) -> set[str]:
    """Elementos del netlist, símbolos entre llaves y símbolos con valor en
    escenarios o preguntas, en minúsculas."""
    nombres: set[str] = set()
    for linea in (outcome.get("netlist") or "").splitlines():
        tokens = linea.split()
        if tokens and not tokens[0].startswith(("*", ".")):
            nombres.add(tokens[0].lower())
    nombres |= {s.lower() for s in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", " ".join(re.findall(r"\{([^{}]*)\}", outcome.get("netlist") or "")))}
    for caso in (outcome.get("escenarios") or []) + (outcome.get("preguntas") or []):
        nombres |= {(v.get("simbolo") or "").lower() for v in caso.get("valores") or []}
    return nombres


def faltantes(outcome: dict) -> list[str]:
    """Los requisitos declarados que no aparecen donde dicen estar."""
    mediciones = {
        _normal(m.get("expresion"))
        for e in outcome.get("escenarios") or []
        for m in e.get("mediciones") or []
    }
    preguntas = {_normal(p.get("calcular")) for p in outcome.get("preguntas") or []}
    nombres = _nombres(outcome)
    faltan = []
    for r in outcome.get("requisitos") or []:
        tipo, expresion, texto = r.get("tipo"), r.get("expresion") or "", r.get("texto") or ""
        if tipo == "eleccion":
            continue
        if not expresion.strip():
            faltan.append(f"«{texto}» ({tipo}) no dice dónde quedó en el planteamiento")
        elif tipo == "medicion" and _normal(expresion) not in mediciones:
            faltan.append(f"«{texto}» debía medirse como {expresion} en algún escenario y no está")
        elif tipo == "pregunta" and _normal(expresion) not in preguntas | mediciones:
            faltan.append(f"«{texto}» se pide calcular ({expresion}) y no está en las preguntas")
        elif tipo == "dato" and expresion.strip().lower() not in nombres:
            faltan.append(f"«{texto}» es un dato del enunciado y {expresion} no está en el netlist")
    return faltan


def lineas_requisitos(outcome: dict, faltan: list[str]) -> list[str]:
    """La tabla del informe: cada requisito del enunciado y cómo quedó."""
    requisitos = outcome.get("requisitos") or []
    if not requisitos:
        return []
    como = {"dato": "dato del circuito", "medicion": "medición de un escenario", "pregunta": "pregunta", "eleccion": "condición de diseño"}
    faltantes_texto = " ".join(faltan)
    lineas = ["| Del enunciado | Quedó como | |", "|---|---|---|"]
    for r in requisitos:
        ok = f"«{r.get('texto') or ''}»" not in faltantes_texto
        destino = como.get(r.get("tipo"), r.get("tipo"))
        expresion = f" `{r['expresion']}`" if r.get("expresion") else ""
        lineas.append(f"| {r.get('texto') or ''} | {destino}{expresion} | {'✓' if ok else '✗ no está'} |")
    return lineas
