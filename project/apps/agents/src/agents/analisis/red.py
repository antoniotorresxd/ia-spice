"""Una red lineal leída de un netlist SPICE.

El análisis no confía en lo que el LLM transcribió más de lo necesario: lee
solo R, L, C y fuentes independientes V/I, y falla con un mensaje claro ante
cualquier otra cosa (un transistor no se resuelve por mallas).
"""

import math
import re
from dataclasses import dataclass

import sympy as sp

TIERRA = "0"

_SUFIJOS = {
    "t": 1e12,
    "g": 1e9,
    "meg": 1e6,
    "k": 1e3,
    "m": 1e-3,
    "u": 1e-6,
    "µ": 1e-6,
    "n": 1e-9,
    "p": 1e-12,
    "f": 1e-15,
}


class RedInvalida(ValueError):
    """El netlist no describe una red lineal que se pueda analizar."""


def valor_spice(texto: str) -> float:
    """'4.7k' -> 4700.0, '10meg' -> 1e7, '2.2uF' -> 2.2e-6 (la unidad se ignora)."""
    m = re.fullmatch(r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)(meg|[tgkmuµnpf])?[a-zA-ZΩ]*", texto.strip(), re.IGNORECASE)
    if not m:
        raise RedInvalida(f"valor no numérico: {texto!r}")
    numero = float(m.group(1))
    sufijo = (m.group(2) or "").lower()
    return numero * _SUFIJOS.get(sufijo, 1.0)


@dataclass(frozen=True)
class Elemento:
    nombre: str
    tipo: str  # "R", "L", "C", "V", "I"
    n1: str  # para fuentes: el terminal +
    n2: str
    valor: float

    @property
    def es_fuente(self) -> bool:
        return self.tipo in ("V", "I")


def _parece_elemento(tokens: list[str]) -> bool:
    """¿La línea es un elemento SPICE (`R1 a b 1k`) y no un título en prosa?

    El LLM transcribe la red sin título; un netlist completo sí lo trae. Se
    distingue por forma: nombre de elemento con dígito o mayúscula inicial
    de una letra de elemento, y al menos dos nodos y un valor detrás.
    """
    return (
        len(tokens) >= 4
        and tokens[0][0].upper() in "RLCVIQDMJXEFGHBKSTWZ"
        and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", tokens[0]) is not None
    )


def _nodo(texto: str) -> str:
    return TIERRA if texto.lower() in ("0", "gnd") else texto


def leer_red(netlist: str) -> list[Elemento]:
    """Elementos de la red, en el orden del netlist.

    Acepta tanto un netlist completo (título, `.control`, `.end`) como solo
    las líneas de elementos. Las fuentes aceptan `V1 a 0 10`, `V1 a 0 DC 10`
    o `V1 a 0 AC 10`.
    """
    elementos: list[Elemento] = []
    dentro_control = False
    for numero, cruda in enumerate(netlist.splitlines()):
        linea = cruda.split(";")[0].strip()
        if not linea or linea.startswith("*") or linea.startswith("+"):
            continue
        baja = linea.lower()
        if baja.startswith(".control"):
            dentro_control = True
            continue
        if baja.startswith(".endc"):
            dentro_control = False
            continue
        if dentro_control or baja.startswith("."):
            continue
        tokens = linea.split()
        tipo = tokens[0][0].upper()
        if numero == 0 and not _parece_elemento(tokens):
            continue  # la primera línea de un netlist SPICE es el título
        if tipo not in "RLCVI":
            raise RedInvalida(
                f"{tokens[0]}: solo se analizan redes de R, L, C y fuentes independientes V/I"
            )
        if len(tokens) < 4:
            raise RedInvalida(f"línea incompleta: {linea!r}")
        valores = [t for t in tokens[3:] if t.upper() not in ("DC", "AC")]
        if not valores:
            raise RedInvalida(f"{tokens[0]} sin valor")
        elementos.append(
            Elemento(
                nombre=tokens[0].upper(),
                tipo=tipo,
                n1=_nodo(tokens[1]),
                n2=_nodo(tokens[2]),
                valor=valor_spice(valores[0]),
            )
        )
    if not elementos:
        raise RedInvalida("el netlist no tiene elementos")
    nombres = [e.nombre for e in elementos]
    repetidos = {n for n in nombres if nombres.count(n) > 1}
    if repetidos:
        raise RedInvalida(f"elementos repetidos: {', '.join(sorted(repetidos))}")
    if not any(TIERRA in (e.n1, e.n2) for e in elementos):
        raise RedInvalida("la red no tiene nodo de referencia (0)")
    return elementos


def nodos(elementos: list[Elemento]) -> list[str]:
    """Nodos distintos de tierra, en orden de aparición."""
    vistos: list[str] = []
    for e in elementos:
        for n in (e.n1, e.n2):
            if n != TIERRA and n not in vistos:
                vistos.append(n)
    return vistos


def impedancia(elemento: Elemento, frecuencia: float | None):
    """Impedancia simbólica exacta (sympy) del elemento pasivo.

    En DC (frecuencia None o 0) un inductor es un corto y un capacitor un
    abierto; ninguno de los dos casos tiene impedancia finita y no nula, así
    que se rechazan aquí y el llamador decide (ver `preparar_dc`).
    """
    valor = sp.nsimplify(elemento.valor, rational=True)
    if elemento.tipo == "R":
        return valor
    if not frecuencia:
        raise RedInvalida(f"{elemento.nombre}: en DC un {elemento.tipo} no tiene impedancia finita")
    omega = 2 * sp.pi * sp.nsimplify(frecuencia, rational=True)
    if elemento.tipo == "L":
        return sp.I * omega * valor
    if elemento.tipo == "C":
        return 1 / (sp.I * omega * valor)
    raise RedInvalida(f"{elemento.nombre} no es pasivo")


def preparar_dc(elementos: list[Elemento]) -> list[Elemento]:
    """En DC: un inductor es un corto (fuente de 0 V) y un capacitor, un abierto."""
    resultado = []
    for e in elementos:
        if e.tipo == "L":
            resultado.append(Elemento(e.nombre, "V", e.n1, e.n2, 0.0))
        elif e.tipo == "C":
            continue
        else:
            resultado.append(e)
    return resultado


def fmt(valor, unidad: str = "", cifras: int = 4) -> str:
    """Número (real o fasor) legible: 2.4 kΩ, 1.25 mA, 3.2∠-45.0° V."""
    complejo = complex(sp.N(valor))
    if abs(complejo.imag) > 1e-12 * max(1.0, abs(complejo.real)):
        numero, prefijo = _ingenieria(abs(complejo), cifras)
        fase = math.degrees(math.atan2(complejo.imag, complejo.real))
        return f"{numero} {prefijo}{unidad}∠{fase:.1f}°".strip()
    numero, prefijo = _ingenieria(complejo.real, cifras)
    return f"{numero} {prefijo}{unidad}".strip()


_PREFIJOS = ((1e9, "G"), (1e6, "M"), (1e3, "k"), (1, ""), (1e-3, "m"), (1e-6, "µ"), (1e-9, "n"), (1e-12, "p"))


def _ingenieria(x: float, cifras: int) -> tuple[str, str]:
    if abs(x) < 1e-15:
        return "0", ""
    for escala, prefijo in _PREFIJOS:
        if abs(x) >= escala * 0.99995:
            return f"{x / escala:.{cifras}g}", prefijo
    return f"{x:.{cifras}g}", ""
