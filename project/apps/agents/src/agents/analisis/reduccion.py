"""Reducción de una red pasiva a su impedancia equivalente, paso a paso.

Combina en serie y en paralelo mientras se pueda; cuando la red queda
trabada (un puente de Wheatstone, por ejemplo) aplica una transformación
Δ→Y y sigue. Cada paso queda escrito como lo escribiría alguien a mano, y el
resultado se puede contrastar con la fuente de prueba del análisis nodal.
"""

from dataclasses import dataclass, field
from itertools import combinations

import sympy as sp

from agents.analisis.red import TIERRA, Elemento, RedInvalida, fmt, impedancia


@dataclass
class _Rama:
    nombre: str
    a: str
    b: str
    z: sp.Expr


@dataclass
class Reduccion:
    terminales: tuple[str, str]
    equivalente: sp.Expr
    pasos: list[str] = field(default_factory=list)


def _anular_fuentes(elementos: list[Elemento]) -> tuple[list[Elemento], list[str]]:
    """Fuentes de tensión en corto, de corriente en abierto (independientes)."""
    pasivos, notas = [], []
    for e in elementos:
        if e.tipo == "V":
            notas.append(f"{e.nombre} (fuente de tensión) se reemplaza por un corto.")
            pasivos.append(Elemento(e.nombre, "V", e.n1, e.n2, 0.0))
        elif e.tipo == "I":
            notas.append(f"{e.nombre} (fuente de corriente) se reemplaza por un abierto.")
        else:
            pasivos.append(e)
    return pasivos, notas


def reducir(
    elementos: list[Elemento], a: str, b: str, frecuencia: float | None = None
) -> Reduccion:
    """Impedancia equivalente vista entre los terminales a y b."""
    a = TIERRA if a.lower() in ("0", "gnd") else a
    b = TIERRA if b.lower() in ("0", "gnd") else b
    pasivos, pasos = _anular_fuentes(elementos)

    # Los cortos (fuentes anuladas, inductores en DC) fusionan nodos.
    alias: dict[str, str] = {}

    def raiz(n: str) -> str:
        while n in alias:
            n = alias[n]
        return n

    ramas: list[_Rama] = []
    for e in pasivos:
        if e.tipo == "V" or (e.tipo == "L" and not frecuencia):
            x, y = raiz(e.n1), raiz(e.n2)
            if x != y:
                # Se conserva el terminal (o tierra) como representante.
                if y in (a, b, TIERRA):
                    x, y = y, x
                alias[y] = x
            continue
        if e.tipo == "C" and not frecuencia:
            continue  # abierto en DC
        nombre = e.nombre if e.tipo == "R" else f"Z_{e.nombre}"
        ramas.append(_Rama(nombre, e.n1, e.n2, impedancia(e, frecuencia)))
    a, b = raiz(a), raiz(b)
    for r in ramas:
        r.a, r.b = raiz(r.a), raiz(r.b)
    if a == b:
        raise RedInvalida("los terminales quedan en corto: la impedancia equivalente es 0")

    contador = 0

    def nueva(z: sp.Expr, x: str, y: str) -> _Rama:
        nonlocal contador
        contador += 1
        return _Rama(f"Z{contador}", x, y, sp.nsimplify(sp.simplify(z)))

    def texto(r: _Rama) -> str:
        return f"{r.nombre} = {fmt(r.z, 'Ω')}"

    for _ in range(500):
        ramas = [r for r in ramas if r.a != r.b]  # una rama en corto consigo misma no conduce
        grado: dict[str, list[_Rama]] = {}
        for r in ramas:
            grado.setdefault(r.a, []).append(r)
            grado.setdefault(r.b, []).append(r)

        # 1. Ramas colgantes: un nodo (no terminal) con una sola conexión.
        colgante = next(
            (n for n, rs in grado.items() if len(rs) == 1 and n not in (a, b)), None
        )
        if colgante is not None:
            r = grado[colgante][0]
            pasos.append(f"{r.nombre} queda colgando del nodo {colgante}: no conduce y se descarta.")
            ramas.remove(r)
            continue

        # 2. Paralelo: dos ramas entre el mismo par de nodos.
        pares: dict[frozenset, list[_Rama]] = {}
        for r in ramas:
            pares.setdefault(frozenset((r.a, r.b)), []).append(r)
        doble = next((rs for rs in pares.values() if len(rs) >= 2), None)
        if doble is not None:
            r1, r2 = doble[0], doble[1]
            z = r1.z * r2.z / (r1.z + r2.z)
            n = nueva(z, r1.a, r1.b)
            pasos.append(f"{r1.nombre} ∥ {r2.nombre}: {n.nombre} = ({r1.nombre}·{r2.nombre})/({r1.nombre}+{r2.nombre}) = {fmt(n.z, 'Ω')}")
            ramas = [r for r in ramas if r not in (r1, r2)] + [n]
            continue

        # 3. Serie: un nodo (no terminal) con exactamente dos ramas.
        serie = next(
            (n for n, rs in grado.items() if len(rs) == 2 and n not in (a, b)), None
        )
        if serie is not None:
            r1, r2 = grado[serie]
            x = r1.a if r1.b == serie else r1.b
            y = r2.a if r2.b == serie else r2.b
            n = nueva(r1.z + r2.z, x, y)
            pasos.append(f"{r1.nombre} + {r2.nombre} (en serie por el nodo {serie}): {texto(n)}")
            ramas = [r for r in ramas if r not in (r1, r2)] + [n]
            continue

        if len(ramas) == 1 and {ramas[0].a, ramas[0].b} == {a, b}:
            return Reduccion((a, b), ramas[0].z, pasos)

        # 4. Trabada: transformar un triángulo en estrella.
        triangulo = _buscar_triangulo(ramas)
        if triangulo is None:
            break
        (x, y, z), (rxy, ryz, rzx) = triangulo
        suma = rxy.z + ryz.z + rzx.z
        centro = f"Y{contador + 1}"
        zx = nueva(rxy.z * rzx.z / suma, x, centro)
        zy = nueva(rxy.z * ryz.z / suma, y, centro)
        zz = nueva(ryz.z * rzx.z / suma, z, centro)
        pasos.append(
            f"Δ→Y sobre {rxy.nombre}, {ryz.nombre}, {rzx.nombre} (nodos {x}, {y}, {z}): "
            f"{texto(zx)}, {texto(zy)}, {texto(zz)}"
        )
        ramas = [r for r in ramas if r not in (rxy, ryz, rzx)] + [zx, zy, zz]

    raise RedInvalida(
        "la red no se reduce con serie, paralelo y Δ→Y; la impedancia equivalente "
        "se obtiene con la fuente de prueba del análisis nodal"
    )


def _buscar_triangulo(ramas: list[_Rama]):
    por_par = {frozenset((r.a, r.b)): r for r in ramas}
    nodos_red = sorted({r.a for r in ramas} | {r.b for r in ramas})
    for x, y, z in combinations(nodos_red, 3):
        lados = [por_par.get(frozenset(p)) for p in ((x, y), (y, z), (z, x))]
        if all(lados):
            return (x, y, z), tuple(lados)
    return None
