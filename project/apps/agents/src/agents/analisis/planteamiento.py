"""Planteamientos: un circuito con incógnitas, escenarios con mediciones y
preguntas.

Es la forma de casi todos los problemas de un libro de op-amps:

- **incógnitas** que son los propios componentes ("encuentra Ri, Aoc y
  Ro", "¿qué R2 hace falta?");
- **escenarios**: el mismo circuito con valores distintos (otra carga, el
  pot en un extremo) y lo que se midió o se exige en cada uno
  (`V(i) = 125 mV`, `V(o)/V(i) = 5`);
- **preguntas**: lo que se pide calcular con lo encontrado, en las
  condiciones que diga cada una (`I(RL)` con la carga en corto).

Las mediciones de todos los escenarios forman un sistema que sympy resuelve
para las incógnitas. Nunca se adivina: si faltan mediciones se dice cuáles
incógnitas quedan libres. Después ngspice simula cada escenario y cada
pregunta con los valores encontrados y se comprueba que reproduzca lo
medido.
"""

import itertools
from dataclasses import replace

import sympy as sp

from agents.analisis.red import RedInvalida
from agents.analisis.simbolico import (
    Componente,
    _valor,
    coinciden,
    evaluar,
    leer_circuito,
    medir_con_ngspice,
    resolver,
    simbolos_libres,
)


def _cantidad(valor) -> sp.Expr:
    """40, 0.15, "30k", "inf", "{2*R}" -> expresión exacta."""
    if isinstance(valor, (int, float)):
        return sp.oo if valor == float("inf") else sp.nsimplify(valor, rational=True)
    return _valor(str(valor))


def _sustituir(circuito: list[Componente], valores: dict) -> tuple[list[Componente], set[str]]:
    """El circuito con los valores del escenario. Una R que queda en 0 es un
    corto (fuente de 0 V, para que su corriente siga siendo medible) y una
    que queda infinita, un abierto (se quita; su corriente es 0)."""
    resultado, abiertos = [], set()
    for c in circuito:
        valor = c.valor.subs(valores) if c.valor is not None else None
        params = {k: sp.sympify(v).subs(valores) for k, v in c.params.items()}
        if c.tipo == "R" and valor is not None and not valor.free_symbols:
            if valor == 0:
                resultado.append(Componente(c.nombre, "V", c.nodos, sp.Integer(0)))
                continue
            if valor == sp.oo:
                abiertos.add(c.nombre)
                continue
        resultado.append(replace(c, valor=valor, params=params))
    return resultado, abiertos


def _evaluar(solucion, expresion: str, abiertos: set[str]) -> sp.Expr:
    for nombre in abiertos:
        solucion.corrientes.setdefault(nombre, sp.Integer(0))
    return evaluar(solucion, expresion)


def _valores(d: dict | None) -> dict:
    return {sp.Symbol(k): _cantidad(v) for k, v in (d or {}).items()}


def _a_float(x: sp.Expr):
    x = sp.N(x)
    if x.free_symbols:
        return str(x)
    complejo = complex(x)
    return complejo.real if abs(complejo.imag) <= 1e-12 * max(1.0, abs(complejo.real)) else {"real": complejo.real, "imag": complejo.imag}


def _elegir(soluciones: list[dict], incognitas: list[sp.Symbol]) -> dict | None:
    """Entre varias raíces, la que tiene todas las incógnitas reales y,
    si hay más de una, la de todas positivas (resistencias, ganancias)."""
    completas = [s for s in soluciones if all(i in s for i in incognitas)]
    reales = [s for s in completas if all(sp.N(s[i]).is_real for i in incognitas)]
    positivas = [s for s in reales if all(sp.N(s[i]) > 0 for i in incognitas)]
    for grupo in (positivas, reales, completas):
        if grupo:
            return grupo[0]
    return None


def _resolver_incognitas(ecuaciones: list[sp.Eq], incognitas: list[sp.Symbol]) -> tuple[dict, str | None]:
    if not ecuaciones:
        return {}, "faltan datos: no hay mediciones para deducir las incógnitas"
    soluciones = sp.solve(ecuaciones, incognitas, dict=True)
    if not soluciones and len(ecuaciones) > len(incognitas):
        # Mediciones redondeadas pueden dejar el sistema sobredeterminado
        # sin solución exacta: se resuelve con subconjuntos y se elige la
        # que mejor reproduce las demás.
        mejor, residuo = None, None
        for grupo in itertools.combinations(ecuaciones, len(incognitas)):
            for candidata in sp.solve(list(grupo), incognitas, dict=True):
                if not all(i in candidata for i in incognitas):
                    continue
                r = sum(abs(complex(sp.N((e.lhs - e.rhs).subs(candidata)))) for e in ecuaciones)
                if residuo is None or r < residuo:
                    mejor, residuo = candidata, r
        soluciones = [mejor] if mejor else []
    if not soluciones:
        return {}, "las mediciones son incompatibles entre sí: no hay valores que las cumplan todas"
    elegida = _elegir(soluciones, incognitas)
    if elegida is None:
        libres = sorted({str(x) for s in soluciones for x in incognitas if x not in s})
        return {}, f"faltan datos: con estas mediciones quedan libres {', '.join(libres)}"
    libres = sorted({str(x) for v in elegida.values() for x in sp.sympify(v).free_symbols})
    if libres:
        return {}, f"faltan datos: con estas mediciones quedan libres {', '.join(libres)}"
    return elegida, None


def resolver_planteamiento(spec: dict) -> dict:
    """Nunca lanza: un problema del planteamiento vuelve como `error`."""
    try:
        return _resolver_planteamiento(spec)
    except RedInvalida as exc:
        return {"error": str(exc), "incognitas": {}, "escenarios": [], "preguntas": [], "verificacion": {"coincide": False, "escenarios": [], "preguntas": []}}


def _resolver_planteamiento(spec: dict) -> dict:
    circuito = leer_circuito(spec["netlist"])
    incognitas = [sp.Symbol(n) for n in spec.get("incognitas") or []]
    escenarios = spec.get("escenarios") or []
    preguntas = spec.get("preguntas") or []

    # 1. Cada medición de cada escenario es una ecuación en las incógnitas.
    ecuaciones: list[sp.Eq] = []
    planteados = []
    for k, escenario in enumerate(escenarios):
        circ, abiertos = _sustituir(circuito, _valores(escenario.get("valores")))
        solucion = resolver(circ)
        filas = []
        for expresion, medido in (escenario.get("mediciones") or {}).items():
            izquierda = _evaluar(solucion, expresion, abiertos)
            ecuacion = sp.Eq(izquierda, _cantidad(medido))
            ecuaciones.append(ecuacion)
            filas.append({"expresion": expresion, "ecuacion": ecuacion, "medido": _a_float(_cantidad(medido))})
        planteados.append({"nombre": escenario.get("nombre") or f"escenario {k + 1}", "valores": escenario.get("valores") or {}, "ecuaciones": filas})

    resueltas: dict = {}
    if incognitas:
        resueltas, error = _resolver_incognitas(ecuaciones, incognitas)
        if error:
            return {"error": error, "incognitas": {}, "escenarios": planteados, "preguntas": [], "verificacion": {"coincide": False, "escenarios": [], "preguntas": []}}

    # 2. Las preguntas, con las incógnitas ya resueltas.
    respuestas = []
    for k, pregunta in enumerate(preguntas):
        valores = {**resueltas, **_valores(pregunta.get("valores"))}
        circ, abiertos = _sustituir(circuito, valores)
        valor = _evaluar(resolver(circ), pregunta["calcular"], abiertos).subs(resueltas)
        respuestas.append({
            "nombre": pregunta.get("nombre") or f"pregunta {k + 1}",
            "calcular": pregunta["calcular"],
            "valores": pregunta.get("valores") or {},
            "expresion": valor,
            "valor": _a_float(valor),
        })

    # 3. ngspice: cada escenario reproduce sus mediciones, cada pregunta su valor.
    verificacion = _verificar(circuito, resueltas, escenarios, preguntas, respuestas)
    return {
        "error": None,
        "incognitas": {str(k): _a_float(v) for k, v in resueltas.items()},
        "escenarios": planteados,
        "preguntas": respuestas,
        "verificacion": verificacion,
    }


def _medir(circuito, valores: dict, expresion: str):
    circ, abiertos = _sustituir(circuito, valores)
    texto, medida, error = medir_con_ngspice(circ)
    if error:
        return texto, None, error
    try:
        return texto, float(sp.N(_evaluar(medida, expresion, abiertos))), None
    except (RedInvalida, KeyError, TypeError) as exc:
        return texto, None, f"no se puede medir {expresion} con ngspice ({exc})"


def _verificar(circuito, resueltas, escenarios, preguntas, respuestas) -> dict:
    por_escenario, por_pregunta, pruebas = [], [], []
    for escenario in escenarios:
        valores = {**resueltas, **_valores(escenario.get("valores"))}
        filas, netlist = [], None
        for expresion, medido in (escenario.get("mediciones") or {}).items():
            netlist, simulado, error = _medir(circuito, valores, expresion)
            esperado = float(sp.N(_cantidad(medido)))
            ok = error is None and coinciden(simulado, esperado)
            filas.append({"expresion": expresion, "medido": esperado, "ngspice": simulado, "error": error, "coincide": ok})
        ok = bool(filas) and all(f["coincide"] for f in filas)
        pruebas.append(ok)
        por_escenario.append({"nombre": escenario.get("nombre"), "mediciones": filas, "coincide": ok, "netlist": netlist})
    for pregunta, respuesta in zip(preguntas, respuestas):
        valores = {**resueltas, **_valores(pregunta.get("valores"))}
        netlist, simulado, error = _medir(circuito, valores, pregunta["calcular"])
        esperado = respuesta["valor"]
        ok = error is None and isinstance(esperado, float) and coinciden(simulado, esperado)
        pruebas.append(ok)
        por_pregunta.append({"nombre": respuesta["nombre"], "ngspice": simulado, "error": error, "coincide": ok, "netlist": netlist})
    return {"coincide": bool(pruebas) and all(pruebas), "escenarios": por_escenario, "preguntas": por_pregunta}


__all__ = ["resolver_planteamiento", "simbolos_libres"]
