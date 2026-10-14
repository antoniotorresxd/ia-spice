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
import re
from dataclasses import replace

import sympy as sp

from agents.analisis.red import RedInvalida, _ingenieria, fmt
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


# --- entrada desde el orquestador e informe ------------------------------------------

_SUFIJO_SPICE = {"G": "g", "M": "meg", "k": "k", "": "", "m": "m", "µ": "u", "n": "n", "p": "p"}


def _spice(x: sp.Expr) -> str:
    """500000 -> '500k', 1e6 -> '1meg' (en SPICE 'M' es mili), 0.15 -> '150m'."""
    numero, prefijo = _ingenieria(float(sp.N(x)), 6)
    return f"{numero}{_SUFIJO_SPICE.get(prefijo, prefijo)}"


def netlist_con_valores(netlist: str, valores: dict) -> str:
    """El netlist con cada `{expresión}` reemplazada por su número, para
    dibujarlo; lo que siga siendo simbólico queda entre llaves."""

    def reemplazar(m: re.Match) -> str:
        try:
            x = _valor(m.group(0)).subs(valores)
        except RedInvalida:
            return m.group(0)
        if x.free_symbols:
            return m.group(0)
        if x == sp.oo:
            return "1e15"  # un abierto se dibuja como una R enorme
        return _spice(x)

    return re.sub(r"\{[^{}]*\}", reemplazar, netlist)


def _lista_a_dict(pares, clave: str, valor: str) -> dict:
    return {p[clave]: p[valor] for p in pares or [] if p.get(clave)}


def spec_desde_outcome(outcome: dict) -> dict:
    """AnalysisOutcome (listas de pares, cómodas para el structured output)
    -> el planteamiento que entiende `resolver_planteamiento`."""
    return {
        "netlist": outcome["netlist"],
        "incognitas": outcome.get("incognitas") or [],
        "escenarios": [
            {
                "nombre": e.get("nombre"),
                "valores": _lista_a_dict(e.get("valores"), "simbolo", "valor"),
                "mediciones": _lista_a_dict(e.get("mediciones"), "expresion", "valor"),
            }
            for e in outcome.get("escenarios") or []
        ],
        "preguntas": [
            {"nombre": p.get("nombre"), "valores": _lista_a_dict(p.get("valores"), "simbolo", "valor"), "calcular": p["calcular"]}
            for p in outcome.get("preguntas") or []
            if p.get("calcular")
        ],
    }


def necesita_motor(outcome: dict) -> bool:
    """¿El análisis de redes pasivas no alcanza? Sí si hay incógnitas,
    escenarios o preguntas, símbolos, o elementos que aquel no acepta."""
    if outcome.get("incognitas") or outcome.get("escenarios") or outcome.get("preguntas"):
        return True
    netlist = outcome.get("netlist") or ""
    if "{" in netlist:
        return True
    return any(re.match(r"\s*[EGFHX][A-Za-z0-9_]*\s", linea, re.IGNORECASE) for linea in netlist.splitlines())


def _tex(x) -> str:
    """LaTeX con los símbolos como en un cuaderno: Ri -> R_{i}, vS -> v_{S}."""
    expr = sp.sympify(x)
    nombres = {
        sim: f"{sim.name[0]}_{{{sim.name[1:]}}}"
        for sim in expr.free_symbols
        if len(sim.name) > 1 and sim.name[1:].isalnum() and "_" not in sim.name
    }
    return sp.latex(expr, symbol_names=nombres)


def _num(x) -> str:
    if isinstance(x, (int, float)):
        return fmt(x)
    if isinstance(x, dict):
        return fmt(complex(x["real"], x["imag"]))
    return f"${_tex(x)}$" if x is not None else "—"


def _tex_expresion(expresion: str) -> str:
    """`V(o)/V(i)` -> `V_{o}/V_{i}`, `I(RL)` -> `I_{RL}` para LaTeX."""
    texto = re.sub(r"\bV\(\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*\)", r"V_{\1\2}", expresion)
    texto = re.sub(r"\bV\(\s*([^()\s]+)\s*\)", r"V_{\1}", texto)
    texto = re.sub(r"\bI\(\s*([^()\s]+)\s*\)", r"I_{\1}", texto)
    # un guión bajo dentro de un nombre de nodo (nodo_in) es texto, no subíndice
    return re.sub(r"_(?!\{)", r"\\_", texto)


def informe_planteamiento(spec: dict, r: dict) -> str:
    lineas = ["## 1. Planteamiento", "", "```spice", spec["netlist"].strip(), "```", ""]
    if spec.get("incognitas"):
        lineas.append("Incógnitas: " + ", ".join(f"${_tex(sp.Symbol(i))}$" for i in spec["incognitas"]) + ".")
        lineas.append("")
    if r.get("error"):
        lineas += ["## 2. No se pudo resolver", "", r["error"] + "."]
        return "\n".join(lineas)

    seccion = 2
    if r["escenarios"]:
        lineas += [f"## {seccion}. Ecuaciones", ""]
        seccion += 1
        for e in r["escenarios"]:
            condiciones = ", ".join(f"{k} = {v}" for k, v in e["valores"].items())
            lineas.append(f"**{e['nombre']}**" + (f" ({condiciones})" if condiciones else "") + ":")
            lineas.append("")
            for fila in e["ecuaciones"]:
                lineas.append(f"$${_tex(fila['ecuacion'])}$$")
            lineas.append("")

    if r["incognitas"]:
        lineas += [f"## {seccion}. Resultado", "", "| Incógnita | Valor |", "|---|---|"]
        lineas += [f"| ${_tex(sp.Symbol(k))}$ | {_num(v)} |" for k, v in r["incognitas"].items()]
        lineas.append("")
        seccion += 1

    if r["preguntas"]:
        lineas += [f"## {seccion}. Respuestas", ""]
        seccion += 1
        for p in r["preguntas"]:
            condiciones = ", ".join(f"{k} = {v}" for k, v in p["valores"].items())
            lineas.append(
                f"- ${_tex_expresion(p['calcular'])}$" + (f" con {condiciones}" if condiciones else "") + f" = **{_num(p['valor'])}**"
            )
        lineas.append("")

    v = r["verificacion"]
    lineas += [f"## {seccion}. Verificación con ngspice", ""]
    filas = [
        (e["nombre"], m["expresion"], m["medido"], m["ngspice"], m["coincide"], m["error"])
        for e in v["escenarios"]
        for m in e["mediciones"]
    ] + [
        (p["nombre"], q["calcular"], q["valor"], p["ngspice"], p["coincide"], p["error"])
        for p, q in zip(v["preguntas"], r["preguntas"])
    ]
    if not filas:
        lineas.append("No hubo nada que simular.")
    else:
        lineas += ["| Caso | Magnitud | Esperado | ngspice | |", "|---|---|---|---|---|"]
        for caso, magnitud, esperado, simulado, ok, error in filas:
            simulado_txt = _num(simulado) if simulado is not None else (error or "—")
            lineas.append(f"| {caso} | ${_tex_expresion(magnitud)}$ | {_num(esperado)} | {simulado_txt} | {'✓' if ok else '✗'} |")
        lineas.append("")
        lineas.append(
            "ngspice reproduce todo con los valores encontrados." if v["coincide"] else "ngspice **no** reproduce todo: revisar el planteamiento."
        )
    return "\n".join(lineas)


def analizar_planteamiento(outcome: dict) -> dict:
    """Mismo contrato que `informe.analizar`, para el nodo analisis."""
    spec = spec_desde_outcome(outcome)
    if not spec["incognitas"] and not spec["preguntas"]:
        # "find vN, vP y vO": sin preguntas explícitas, todas las tensiones de nodo
        try:
            circuito = leer_circuito(spec["netlist"])
        except RedInvalida as exc:
            return {"error": str(exc), "informe": f"No se pudo leer la red: {exc}", "resultados": {}, "netlist": None, "netlist_zeq": None}
        nodos: list[str] = []
        for c in circuito:
            for n in c.nodos:
                if n != "0" and n not in nodos:
                    nodos.append(n)
        spec["preguntas"] = [{"nombre": f"V({n})", "valores": {}, "calcular": f"V({n})"} for n in nodos]
    r = resolver_planteamiento(spec)
    informe = informe_planteamiento(spec, r)
    if r["error"]:
        return {"error": r["error"], "informe": informe, "resultados": {}, "netlist": None, "netlist_zeq": None, "formato": "markdown"}
    valores = {sp.Symbol(k): sp.nsimplify(v, rational=True) for k, v in r["incognitas"].items() if isinstance(v, float)}
    primero = (spec["escenarios"] or spec["preguntas"] or [{}])[0]
    for k, v in (primero.get("valores") or {}).items():
        valores[sp.Symbol(k)] = _cantidad(v)
    return {
        "error": None,
        "informe": informe,
        "resultados": {
            "validacion": {"coincide": r["verificacion"]["coincide"], "error": None},
            "planteamiento": {
                "incognitas": r["incognitas"],
                "preguntas": [{"calcular": p["calcular"], "valor": p["valor"]} for p in r["preguntas"]],
            },
        },
        "netlist": netlist_con_valores(spec["netlist"], valores),
        "netlist_zeq": None,
        "formato": "markdown",
    }
