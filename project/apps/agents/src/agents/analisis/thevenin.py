"""Equivalentes de Thévenin y Norton vistos desde dos terminales."""

from dataclasses import dataclass

import sympy as sp

from agents.analisis.ecuaciones import analisis_nodal
from agents.analisis.red import TIERRA, Elemento, RedInvalida, preparar_dc
from agents.analisis.reduccion import Reduccion, reducir


@dataclass
class Thevenin:
    terminales: tuple[str, str]
    vth: sp.Expr
    zth: sp.Expr
    norton: sp.Expr | None  # None si Zth = 0 (fuente de tensión ideal)
    reduccion: Reduccion | None
    zth_por_prueba: sp.Expr


def _normal(n: str) -> str:
    return TIERRA if n.lower() in ("0", "gnd") else n


def impedancia_por_prueba(
    elementos: list[Elemento], a: str, b: str, frecuencia: float | None
) -> sp.Expr:
    """Zth con fuentes anuladas y 1 A de prueba inyectado en a: Zth = V(a) - V(b)."""
    anulada = [
        Elemento(e.nombre, "V", e.n1, e.n2, 0.0) if e.tipo == "V" else e
        for e in elementos
        if e.tipo != "I"
    ]
    prueba = Elemento("I_PRUEBA", "I", b, a, 1.0)
    solucion = analisis_nodal(anulada + [prueba], frecuencia)
    va = solucion.tensiones.get(a, sp.Integer(0))
    vb = solucion.tensiones.get(b, sp.Integer(0))
    return sp.nsimplify(sp.simplify(va - vb))


def thevenin(
    elementos: list[Elemento], a: str, b: str = TIERRA, frecuencia: float | None = None
) -> Thevenin:
    a, b = _normal(a), _normal(b)
    # Nodos y fuente de prueba trabajan sobre la red ya resuelta para DC
    # (L en corto, C abierto); la reducción recibe la original y lo resuelve
    # ella misma, para poder explicar cada paso.
    red = elementos if frecuencia else preparar_dc(elementos)
    abierto = analisis_nodal(red, frecuencia)
    for terminal in (a, b):
        if terminal != TIERRA and terminal not in abierto.tensiones:
            raise RedInvalida(f"el terminal {terminal} no es un nodo de la red")
    vth = sp.simplify(abierto.tensiones.get(a, 0) - abierto.tensiones.get(b, 0))

    zth_prueba = impedancia_por_prueba(red, a, b, frecuencia)
    try:
        reduccion = reducir(elementos, a, b, frecuencia)
    except RedInvalida:
        reduccion = None
    zth = reduccion.equivalente if reduccion else zth_prueba
    norton = None if zth == 0 else sp.nsimplify(sp.simplify(vth / zth))
    return Thevenin((a, b), sp.nsimplify(vth), zth, norton, reduccion, zth_prueba)
