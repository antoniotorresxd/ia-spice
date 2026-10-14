"""Análisis nodal (MNA) y de mallas sobre una red lineal.

Los dos métodos arman ecuaciones simbólicas —con el nombre de cada elemento
como símbolo, que es como se escriben en un cuaderno— y las resuelven
sustituyendo los valores. Devuelven lo mismo: las ecuaciones, las incógnitas
resueltas y la corriente de cada rama, de modo que se puedan comparar entre
sí y contra ngspice.
"""

from dataclasses import dataclass, field

import networkx as nx
import sympy as sp

from agents.analisis.red import TIERRA, Elemento, RedInvalida, impedancia, nodos


@dataclass
class Solucion:
    metodo: str
    ecuaciones: list[sp.Eq]
    incognitas: dict[str, sp.Expr]  # nombre de la incógnita -> valor
    tensiones: dict[str, sp.Expr]  # nodo -> tensión respecto de tierra
    corrientes: dict[str, sp.Expr]  # elemento -> corriente de n1 a n2
    notas: list[str] = field(default_factory=list)


def _simbolo(e: Elemento, frecuencia: float | None):
    """Impedancia o fuente como símbolo, y su valor para sustituir."""
    if e.es_fuente:
        return sp.Symbol(e.nombre), sp.nsimplify(e.valor, rational=True)
    if e.tipo == "R":
        return sp.Symbol(e.nombre), impedancia(e, frecuencia)
    return sp.Symbol(f"Z_{e.nombre}"), impedancia(e, frecuencia)


def _resolver(ecuaciones: list[sp.Eq], incognitas: list[sp.Symbol], valores: dict) -> dict:
    sustituidas = []
    for eq in ecuaciones:
        sustituida = eq.subs(valores)
        if sustituida is sp.false:
            # Una ecuación sin incógnitas que no se cumple: p. ej. una fuente
            # de corriente sola entre dos nodos sin otro camino.
            raise RedInvalida(
                "el sistema es singular: hay un corte de fuentes de corriente o un nodo flotante"
            )
        if sustituida is not sp.true:
            sustituidas.append(sustituida)
    matriz, vector = sp.linear_eq_to_matrix(sustituidas, incognitas)
    if matriz.rows != matriz.cols:
        raise RedInvalida("el sistema es singular: hay un nodo flotante")
    if matriz.det() == 0:
        raise RedInvalida(
            "el sistema es singular: hay un nodo flotante, un lazo de fuentes de tensión "
            "o un corte de fuentes de corriente"
        )
    solucion = matriz.LUsolve(vector)
    return {s: sp.nsimplify(sp.simplify(v)) for s, v in zip(incognitas, solucion)}


def analisis_nodal(elementos: list[Elemento], frecuencia: float | None = None) -> Solucion:
    """Análisis nodal modificado: KCL en cada nodo; cada fuente de tensión
    agrega su corriente como incógnita y su ecuación de restricción."""
    lista_nodos = nodos(elementos)
    v = {n: sp.Symbol(f"V_{n}") for n in lista_nodos}
    v[TIERRA] = sp.Integer(0)
    simbolos = {e.nombre: _simbolo(e, frecuencia) for e in elementos}
    valores = {sim: val for sim, val in simbolos.values()}
    corriente_fuente = {e.nombre: sp.Symbol(f"I_{e.nombre}") for e in elementos if e.tipo == "V"}

    def corriente(e: Elemento) -> sp.Expr:
        sim, _ = simbolos[e.nombre]
        if e.tipo == "V":
            return corriente_fuente[e.nombre]
        if e.tipo == "I":
            return sim
        return (v[e.n1] - v[e.n2]) / sim

    ecuaciones = []
    for n in lista_nodos:
        salientes = sp.Integer(0)
        for e in elementos:
            if e.n1 == n:
                salientes += corriente(e)
            elif e.n2 == n:
                salientes -= corriente(e)
        ecuaciones.append(sp.Eq(salientes, 0))
    for e in elementos:
        if e.tipo == "V":
            ecuaciones.append(sp.Eq(v[e.n1] - v[e.n2], simbolos[e.nombre][0]))

    incognitas = [v[n] for n in lista_nodos] + list(corriente_fuente.values())
    resueltas = _resolver(ecuaciones, incognitas, valores)
    todo = {**valores, **resueltas}
    return Solucion(
        metodo="nodos",
        ecuaciones=ecuaciones,
        incognitas={str(s): val for s, val in resueltas.items()},
        tensiones={n: sp.nsimplify(v[n].subs(todo)) for n in lista_nodos},
        corrientes={e.nombre: sp.simplify(corriente(e).subs(todo)) for e in elementos},
    )


def _mallas(elementos: list[Elemento]) -> list[list[tuple[Elemento, int]]]:
    """Las mallas de una red plana: las caras internas de su embebido plano.

    Cada malla es la lista de (elemento, sentido): +1 si la malla recorre el
    elemento de n1 a n2. Cada elemento se subdivide con un nodo propio para
    que dos elementos en paralelo entre los mismos nodos (una multiarista)
    sigan siendo un grafo simple que networkx pueda embeber.
    """
    grafo = nx.Graph()
    for e in elementos:
        if e.n1 == e.n2:
            continue
        grafo.add_edge(("n", e.n1), ("e", e.nombre))
        grafo.add_edge(("e", e.nombre), ("n", e.n2))
    if not nx.is_connected(grafo):
        raise RedInvalida("la red no es conexa")
    plano, embebido = nx.check_planarity(grafo)
    if not plano:
        raise RedInvalida("la red no es plana: no tiene mallas (usar análisis nodal)")

    por_nombre = {e.nombre: e for e in elementos}
    caras, visitadas = [], set()
    for u, w in embebido.edges():
        if (u, w) in visitadas:
            continue
        cara = embebido.traverse_face(u, w, mark_half_edges=visitadas)
        caras.append(cara)

    mallas = []
    for cara in caras:
        recorrido = []
        k = len(cara)
        for i, vertice in enumerate(cara):
            if vertice[0] != "e":
                continue
            anterior, siguiente = cara[(i - 1) % k], cara[(i + 1) % k]
            e = por_nombre[vertice[1]]
            sentido = 1 if (anterior[1], siguiente[1]) == (e.n1, e.n2) else -1
            recorrido.append((e, sentido))
        mallas.append(recorrido)
    # La cara externa es la que rodea a todas; por convención, la de más
    # elementos. Las demás son las mallas.
    mallas.sort(key=len)
    return mallas[:-1]


def analisis_mallas(elementos: list[Elemento], frecuencia: float | None = None) -> Solucion:
    """KVL en cada malla con corrientes de malla como incógnitas.

    Una fuente de corriente agrega su tensión como incógnita y la ecuación
    que fija su corriente: es la supermalla escrita de forma sistemática.
    """
    mallas = _mallas(elementos)
    i = [sp.Symbol(f"I_m{k + 1}") for k in range(len(mallas))]
    simbolos = {e.nombre: _simbolo(e, frecuencia) for e in elementos}
    valores = {sim: val for sim, val in simbolos.values()}
    tension_fuente = {e.nombre: sp.Symbol(f"V_{e.nombre}") for e in elementos if e.tipo == "I"}

    def rama(e: Elemento) -> sp.Expr:
        """Corriente del elemento de n1 a n2 como suma de corrientes de malla."""
        total = sp.Integer(0)
        for k, malla in enumerate(mallas):
            for otro, sentido in malla:
                if otro.nombre == e.nombre:
                    total += sentido * i[k]
        return total

    def caida(e: Elemento) -> sp.Expr:
        """Caída de tensión de n1 a n2."""
        sim, _ = simbolos[e.nombre]
        if e.tipo == "V":
            return sim
        if e.tipo == "I":
            return tension_fuente[e.nombre]
        return sim * rama(e)

    ecuaciones = []
    for malla in mallas:
        ecuaciones.append(sp.Eq(sp.Add(*[sentido * caida(e) for e, sentido in malla]), 0))
    for e in elementos:
        if e.tipo == "I":
            ecuaciones.append(sp.Eq(rama(e), simbolos[e.nombre][0]))

    incognitas = i + list(tension_fuente.values())
    resueltas = _resolver(ecuaciones, incognitas, valores)
    todo = {**valores, **resueltas}
    corrientes = {}
    for e in elementos:
        if e.tipo == "V":
            # SPICE mide la corriente de una fuente entrando por su terminal
            # +; la de malla que la recorre de n1 a n2 es exactamente esa.
            corrientes[e.nombre] = sp.simplify(rama(e).subs(todo))
        elif e.tipo == "I":
            corrientes[e.nombre] = simbolos[e.nombre][1]
        else:
            corrientes[e.nombre] = sp.simplify(rama(e).subs(todo))

    return Solucion(
        metodo="mallas",
        ecuaciones=ecuaciones,
        incognitas={str(s): val for s, val in resueltas.items()},
        tensiones=_tensiones_desde_corrientes(elementos, corrientes, valores, simbolos, todo),
        corrientes=corrientes,
        notas=[
            "Malla " + str(k + 1) + ": " + " → ".join(e.nombre for e, _ in malla)
            for k, malla in enumerate(mallas)
        ],
    )


def _tensiones_desde_corrientes(elementos, corrientes, valores, simbolos, todo) -> dict:
    """Tensiones de nodo recorriendo un árbol desde tierra con las caídas ya
    conocidas, para que mallas reporte lo mismo que nodos."""
    tensiones = {TIERRA: sp.Integer(0)}
    pendientes = list(elementos)
    while pendientes:
        avance = False
        for e in list(pendientes):
            sim, _ = simbolos[e.nombre]
            if e.tipo == "V":
                caida = sim.subs(valores)
            elif e.tipo == "I":
                caida = sp.Symbol(f"V_{e.nombre}").subs(todo)
            else:
                caida = (sim * corrientes[e.nombre]).subs(valores)
            if e.n1 in tensiones and e.n2 not in tensiones:
                tensiones[e.n2] = sp.nsimplify(tensiones[e.n1] - caida)
            elif e.n2 in tensiones and e.n1 not in tensiones:
                tensiones[e.n1] = sp.nsimplify(tensiones[e.n2] + caida)
            elif e.n1 not in tensiones:
                continue
            pendientes.remove(e)
            avance = True
        if not avance:
            break
    tensiones.pop(TIERRA)
    return {n: sp.simplify(val) for n, val in tensiones.items()}
