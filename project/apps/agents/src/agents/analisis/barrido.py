"""Barrido del parámetro de un planteamiento: el cursor de un pot, una
carga, la ganancia de un op-amp.

Un problema de ganancia en DC no tiene un eje natural que graficar, pero si
sus escenarios difieren en un solo símbolo (el pot en k = 0 y en k = 1) ese
símbolo es el eje: el motor da la curva completa en letras y ngspice simula
unos cuantos puntos encima, para que se vea que la recorre.
"""

import math

import sympy as sp

from agents.analisis.red import RedInvalida
from agents.analisis.simbolico import coinciden
from agents.analisis.transferencia import tiene_funciones
from agents.analisis.planteamiento import _Caso, _medir_dc, _usa_circuito, _valores

PUNTOS = 41
PUNTOS_NGSPICE = 5


def _casos(spec: dict) -> list[dict]:
    """Los valores de cada escenario y de cada pregunta de valor."""
    casos = [_valores(e.get("valores")) for e in spec.get("escenarios") or []]
    casos += [_valores(p.get("valores")) for p in spec.get("preguntas") or [] if (p.get("tipo") or "valor") == "valor"]
    return casos


def _parametro(casos: list[dict]) -> tuple[sp.Symbol, float, float] | None:
    """El único símbolo que toma dos o más valores finitos distintos entre
    los casos, con su rango. Con dos o más que cambian no hay un solo eje."""
    rangos: dict[sp.Symbol, set[float]] = {}
    for caso in casos:
        for simbolo, valor in caso.items():
            numero = sp.N(valor)
            if numero.is_real and numero.is_finite:
                rangos.setdefault(simbolo, set()).add(float(numero))
    variables = [(s, v) for s, v in rangos.items() if len(v) > 1]
    if len(variables) != 1:
        return None
    simbolo, valores = variables[0]
    return simbolo, min(valores), max(valores)


def _magnitud(spec: dict) -> str | None:
    """Lo que se grafica: la primera medición de los escenarios o, si no
    hay, la primera pregunta de valor. Solo magnitudes de DC del circuito."""
    candidatas = [m.get("expresion") if isinstance(m, dict) else m for e in spec.get("escenarios") or [] for m in (e.get("mediciones") or {})]
    candidatas += [p["calcular"] for p in spec.get("preguntas") or [] if (p.get("tipo") or "valor") == "valor"]
    for expresion in candidatas:
        if expresion and _usa_circuito(expresion) and not tiene_funciones(expresion):
            return expresion
    return None


def _unidad(expresion: str) -> str:
    texto = expresion.replace(" ", "")
    tipos = [t for t in texto.split("/") if t[:2] in ("V(", "I(")]
    if len(tipos) == 2 and "/" in texto:
        return f"{tipos[0][0]}/{tipos[1][0]}"
    if len(tipos) == 1 and "/" not in texto:
        return tipos[0][0]
    return ""


def _base(casos: list[dict], simbolo: sp.Symbol) -> dict:
    """Los demás valores, tomados del primer caso que los da."""
    base: dict = {}
    for caso in casos:
        for s, v in caso.items():
            if s != simbolo:
                base.setdefault(s, v)
    return base


def _numero(x: sp.Expr) -> float | None:
    try:
        valor = complex(sp.N(x))
    except (TypeError, ValueError):
        return None
    if abs(valor.imag) > 1e-9 * max(1.0, abs(valor.real)) or not math.isfinite(valor.real):
        return None
    return valor.real


def barrer(circuito, spec: dict, resueltas: dict) -> dict | None:
    """{curve, markers, coincide, simbolo, magnitud, y_unit} o None si el
    planteamiento no tiene un parámetro que barrer."""
    casos = _casos(spec)
    parametro = _parametro(casos)
    magnitud = _magnitud(spec)
    if parametro is None or magnitud is None:
        return None
    simbolo, desde, hasta = parametro
    base = {**_base(casos, simbolo), **resueltas}
    try:
        expresion = sp.simplify(_Caso(circuito, base).calcular(magnitud))
    except (RedInvalida, KeyError, TypeError, ValueError):
        return None
    if expresion.free_symbols - {simbolo}:
        return None  # quedan otros símbolos: no hay una curva sino una familia

    curva = []
    for i in range(PUNTOS):
        x = desde + (hasta - desde) * i / (PUNTOS - 1)
        y = _numero(expresion.subs(simbolo, sp.nsimplify(x, rational=True)))
        if y is not None:
            curva.append({"x": x, "y": y})
    if len(curva) < 2:
        return None

    marcadores, coincide = [], True
    for i in range(PUNTOS_NGSPICE):
        x = desde + (hasta - desde) * i / (PUNTOS_NGSPICE - 1)
        exacto = sp.nsimplify(x, rational=True)
        esperado = _numero(expresion.subs(simbolo, exacto))
        try:
            caso = _Caso(circuito, {**base, simbolo: exacto})
        except RedInvalida:
            continue
        _, medido, error = _medir_dc(caso, magnitud)
        if error or medido is None:
            continue
        marcadores.append({"x": x, "y": medido})
        coincide = coincide and esperado is not None and coinciden(medido, esperado)
    return {
        "curve": curva,
        "markers": marcadores,
        "coincide": bool(marcadores) and coincide,
        "simbolo": str(simbolo),
        "magnitud": magnitud,
        "expresion": expresion,
        "y_unit": _unidad(magnitud),
    }
