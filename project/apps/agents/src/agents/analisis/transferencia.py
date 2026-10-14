"""Funciones de transferencia en el dominio s.

`caracterizar` toma una H(s) —numérica o en letras— y la describe como en
un libro de filtros: forma estándar, polos y ceros, ganancia de DC y de alta
frecuencia, ω₀/f₀ y Q, tipo de respuesta y, si es numérica, su Bode.

`expandir_funciones` deja usar esos parámetros dentro de una expresión,
para preguntas ("¿cuánto vale Q?") y para condiciones de diseño ("f0 =
1 kHz"): `H0(…)`, `Hinf(…)`, `f0(…)`, `w0(…)`, `Q(…)`, `mag(…, f)`,
`db(…, f)` y `fase(…, f)`, con el argumento como cualquier expresión del
motor (`V(o)/V(i)`).
"""

import math
import re

import sympy as sp

from agents.analisis.red import RedInvalida

S = sp.Symbol("s")
FUNCIONES = ("H0", "Hinf", "f0", "w0", "Q", "mag", "db", "fase")
_LLAMADA = re.compile(r"\b(" + "|".join(FUNCIONES) + r")\s*\(")


def _racional(h: sp.Expr) -> tuple[sp.Expr, sp.Expr]:
    num, den = sp.fraction(sp.cancel(sp.together(h)))
    return sp.expand(num), sp.expand(den)


def _poly(expr: sp.Expr) -> sp.Poly:
    try:
        return sp.Poly(expr, S)
    except sp.PolynomialError as exc:
        raise RedInvalida(f"la transferencia no es racional en s: {exc}") from exc


def h0(h: sp.Expr) -> sp.Expr:
    return sp.simplify(sp.limit(h, S, 0))


def hinf(h: sp.Expr) -> sp.Expr:
    return sp.simplify(sp.limit(h, S, sp.oo))


def w0(h: sp.Expr) -> sp.Expr:
    """La raíz n-ésima de d₀/dₙ del denominador: el polo en primer orden, la
    frecuencia natural en segundo."""
    _, den = _racional(h)
    p = _poly(den)
    n = p.degree()
    if n < 1:
        raise RedInvalida("la transferencia no tiene polos: no hay frecuencia característica")
    d0, dn = p.coeff_monomial(1), p.coeff_monomial(S**n)
    if d0 == 0:
        raise RedInvalida("hay un polo en el origen: no hay frecuencia característica finita")
    return sp.simplify(sp.Abs(d0 / dn) ** sp.Rational(1, n)) if not (d0 / dn).free_symbols else sp.simplify((d0 / dn) ** sp.Rational(1, n))


def f0(h: sp.Expr) -> sp.Expr:
    return sp.simplify(w0(h) / (2 * sp.pi))


def q(h: sp.Expr) -> sp.Expr:
    """Q = √(d₀d₂)/d₁ para un denominador de segundo orden."""
    _, den = _racional(h)
    p = _poly(den)
    if p.degree() != 2:
        raise RedInvalida(f"Q se define para un denominador de segundo orden (este es de orden {p.degree()})")
    d0, d1, d2 = p.coeff_monomial(1), p.coeff_monomial(S), p.coeff_monomial(S**2)
    if d1 == 0:
        return sp.oo
    return sp.simplify(sp.sqrt(d0 * d2) / d1)


def en_frecuencia(h: sp.Expr, f: sp.Expr) -> sp.Expr:
    return h.subs(S, sp.I * 2 * sp.pi * f)


def mag(h: sp.Expr, f: sp.Expr) -> sp.Expr:
    return sp.Abs(en_frecuencia(h, f))


def db(h: sp.Expr, f: sp.Expr) -> sp.Expr:
    return 20 * sp.log(mag(h, f), 10)


def fase(h: sp.Expr, f: sp.Expr) -> sp.Expr:
    return sp.arg(en_frecuencia(h, f)) * 180 / sp.pi


def tipo(h: sp.Expr) -> str:
    num, den = _racional(h)
    pn, pd = _poly(num), _poly(den)
    n, m = pd.degree(), pn.degree()
    if n == 0:
        return "ganancia constante"
    potencias = sorted(k[0] for k in pn.monoms())
    if potencias == [0]:
        return "pasa bajos"
    if potencias == [n]:
        return "pasa altos"
    if len(potencias) == 1 and 0 < potencias[0] < n:
        return "pasa banda"
    if m == n == 2 and potencias == [0, 2]:
        return "rechaza banda"
    return "general"


def _numero(x: sp.Expr):
    c = complex(sp.N(x))
    return c.real if abs(c.imag) <= 1e-9 * max(1.0, abs(c.real)) else {"real": c.real, "imag": c.imag}


def rango_bode(h: sp.Expr) -> tuple[float, float]:
    try:
        f = float(sp.N(f0(h)))
        if f > 0 and math.isfinite(f):
            return f / 100, f * 100
    except (RedInvalida, TypeError, ValueError):
        pass
    return 1.0, 1e6


def caracterizar(h: sp.Expr) -> dict:
    h = sp.simplify(h)
    num, den = _racional(h)
    libres = (h.free_symbols - {S})
    resultado: dict = {
        "h": str(sp.simplify(num / den)),
        "h_latex": sp.latex(sp.simplify(num / den)),
        "num": str(num),
        "den": str(den),
        "orden": _poly(den).degree(),
        "tipo": tipo(h),
        "h0": None, "hinf": None, "w0": None, "f0": None, "q": None,
        "polos": [], "ceros": [], "bode": [], "bode_fase": [],
        "simbolica": bool(libres),
    }
    for clave, funcion in (("h0", h0), ("hinf", hinf), ("w0", w0), ("f0", f0), ("q", q)):
        try:
            valor = funcion(h)
        except RedInvalida:
            continue
        resultado[clave] = str(valor) if libres else _numero(valor)
    if not libres:
        resultado["polos"] = [_numero(r) for r in sp.Poly(den, S).nroots()] if _poly(den).degree() else []
        resultado["ceros"] = [_numero(r) for r in sp.Poly(num, S).nroots()] if _poly(num).degree() else []
        fmin, fmax = rango_bode(h)
        funcion = sp.lambdify(S, h, "cmath")
        puntos = 61
        for k in range(puntos):
            f = fmin * (fmax / fmin) ** (k / (puntos - 1))
            valor = complex(funcion(2j * math.pi * f))
            magnitud = abs(valor)
            resultado["bode"].append({"x": f, "y": 20 * math.log10(magnitud) if magnitud > 0 else -300.0})
            resultado["bode_fase"].append({"x": f, "y": math.degrees(math.atan2(valor.imag, valor.real))})
    return resultado


def _argumentos(texto: str, inicio: int) -> tuple[list[str], int]:
    """Los argumentos de la llamada que abre en `inicio` (después del
    paréntesis) y la posición del paréntesis que la cierra."""
    nivel, actual, args, i = 1, "", [], inicio
    while i < len(texto):
        ch = texto[i]
        if ch == "(":
            nivel += 1
        elif ch == ")":
            nivel -= 1
            if nivel == 0:
                args.append(actual.strip())
                return args, i
        if ch == "," and nivel == 1:
            args.append(actual.strip())
            actual = ""
        else:
            actual += ch
        i += 1
    raise RedInvalida(f"paréntesis sin cerrar en {texto!r}")


def tiene_funciones(expresion: str) -> bool:
    return _LLAMADA.search(expresion) is not None


def expandir_funciones(expresion: str, transferencia, cantidad) -> tuple[str, dict, list[dict]]:
    """Reemplaza cada `f0(…)`, `db(…, f)`… por un marcador y devuelve
    (texto, {marcador: valor}, llamadas). `transferencia(texto)` evalúa el
    argumento en el dominio s; `cantidad(texto)` lee una frecuencia."""
    valores: dict = {}
    llamadas: list[dict] = []
    salida, pos = "", 0
    for m in _LLAMADA.finditer(expresion):
        if m.start() < pos:
            continue  # anidada dentro de otra ya procesada
        args, cierre = _argumentos(expresion, m.end())
        nombre = m.group(1)
        h = transferencia(args[0])
        if nombre in ("mag", "db", "fase"):
            if len(args) != 2:
                raise RedInvalida(f"{nombre}(H, f) lleva la frecuencia como segundo argumento")
            f = cantidad(args[1])
            valor = {"mag": mag, "db": db, "fase": fase}[nombre](h, f)
        else:
            if len(args) != 1:
                raise RedInvalida(f"{nombre}(H) lleva un solo argumento")
            f = None
            valor = {"H0": h0, "Hinf": hinf, "f0": f0, "w0": w0, "Q": q}[nombre](h)
        marcador = f"_t{len(valores)}"
        valores[marcador] = valor
        llamadas.append({"funcion": nombre, "argumento": args[0], "frecuencia": f, "h": h})
        salida += expresion[pos : m.start()] + f"({marcador})"
        pos = cierre + 1
    return salida + expresion[pos:], valores, llamadas
