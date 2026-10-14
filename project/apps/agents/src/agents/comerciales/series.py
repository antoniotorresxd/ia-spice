"""Series de valores normalizados IEC 60063 (E6 ... E96).

Un valor calculado (34.4 kΩ) no se consigue en una tienda; lo que se consigue
es el valor de la serie más cercano (33 kΩ en E24) o una combinación de dos.
Este módulo es aritmética pura: no sabe de bloques ni de netlists.
"""

import math

E6 = (1.0, 1.5, 2.2, 3.3, 4.7, 6.8)
E12 = (1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2)
E24 = (
    1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
    3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
)
E96 = tuple(
    v / 100
    for v in (
        100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130,
        133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174,
        178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232,
        237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
        316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412,
        422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549,
        562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732,
        750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
    )
)
# E48 es E96 tomando uno sí y uno no: así lo define la norma.
E48 = E96[::2]

SERIES: dict[str, tuple[float, ...]] = {
    "E6": E6,
    "E12": E12,
    "E24": E24,
    "E48": E48,
    "E96": E96,
}


def _serie(nombre: str) -> tuple[float, ...]:
    try:
        return SERIES[nombre.upper()]
    except KeyError:
        raise ValueError(f"serie desconocida: {nombre!r} (opciones: {', '.join(SERIES)})") from None


def _escalar(mantisa: float, decada: int) -> float:
    # Pasar por texto evita colas binarias del tipo 33000.000000000004, que
    # luego aparecerían tal cual en el netlist y en la lista de materiales.
    return float(f"{mantisa}e{decada}")


def valores_en_rango(serie: str, minimo: float, maximo: float) -> list[float]:
    """Todos los valores de la serie dentro de [minimo, maximo], ordenados."""
    if minimo <= 0 or maximo < minimo:
        return []
    mantisas = _serie(serie)
    valores = []
    for decada in range(math.floor(math.log10(minimo)), math.floor(math.log10(maximo)) + 1):
        for m in mantisas:
            v = _escalar(m, decada)
            if minimo <= v <= maximo:
                valores.append(v)
    return valores


def mas_cercano(valor: float, serie: str) -> float:
    """El valor de la serie más cercano en escala logarítmica.

    Se compara por cociente y no por diferencia porque así está construida la
    serie: los pasos son de razón constante, no de tamaño constante.
    """
    if valor <= 0:
        raise ValueError(f"solo hay valores comerciales positivos, no {valor}")
    decada = math.floor(math.log10(valor))
    candidatos = valores_en_rango(serie, _escalar(1.0, decada - 1), _escalar(1.0, decada + 1))
    return min(candidatos, key=lambda c: abs(math.log(c / valor)))


def paso(valor: float, serie: str, direccion: int) -> float:
    """El valor de la serie inmediatamente arriba (+1) o abajo (-1) de `valor`."""
    if direccion not in (1, -1):
        raise ValueError("direccion debe ser +1 o -1")
    decada = math.floor(math.log10(valor))
    candidatos = valores_en_rango(serie, _escalar(1.0, decada - 1), _escalar(1.0, decada + 2))
    # Tolerancia relativa para que el propio valor (33k) no cuente como vecino.
    if direccion > 0:
        return min(c for c in candidatos if c > valor * (1 + 1e-9))
    return max(c for c in candidatos if c < valor * (1 - 1e-9))


def minimo_no_menor(valor: float, serie: str) -> float:
    """El menor valor de la serie que no queda por debajo de `valor`.

    Para componentes cuya ecuación de diseño es una cota inferior (un
    capacitor de filtrado C >= I/(2·f·Vr), uno de desacoplo CE >= ...):
    redondear al más cercano podría dejarlo por debajo de lo que se exige.
    """
    cercano = mas_cercano(valor, serie)
    if cercano >= valor * (1 - 1e-9):
        return cercano
    return paso(cercano, serie, 1)


def error_relativo(real: float, ideal: float) -> float:
    return (real - ideal) / ideal


def _limpio(valor: float) -> float:
    # 150n + 9.1n da 1.5909999999999998e-07 en binario.
    return float(f"{valor:.12g}")


def mejor_combinacion(
    valor: float, serie: str, aditiva: str = "serie"
) -> tuple[str, list[float], float]:
    """La mejor realización con dos piezas de la serie.

    Dos piezas se combinan de dos formas: sumando (a + b) o por recíprocos
    (a·b / (a + b)). Para resistencias e inductores la suma es la conexión en
    serie; para capacitores es en paralelo, al revés. `aditiva` es el nombre
    que lleva la suma ("serie" o "paralelo") y la otra recibe el contrario.

    Devuelve (realizacion, partes, valor_equivalente). La búsqueda es acotada
    sin perder casos: en la suma, la parte mayor siempre está entre valor/2 y
    valor; en la recíproca, la parte menor siempre está entre valor y 2·valor.
    La otra parte se completa con el valor de la serie más cercano a lo que
    falta.
    """
    reciproca = "paralelo" if aditiva == "serie" else "serie"
    mejor: tuple[str, list[float], float] | None = None

    def _considerar(realizacion: str, partes: list[float], equivalente: float) -> None:
        nonlocal mejor
        if mejor is None or abs(math.log(equivalente / valor)) < abs(math.log(mejor[2] / valor)):
            mejor = (realizacion, partes, equivalente)

    for a in valores_en_rango(serie, valor / 2, valor):
        resto = valor - a
        if resto > 0:
            b = mas_cercano(resto, serie)
            _considerar(aditiva, [a, b], _limpio(a + b))

    for a in valores_en_rango(serie, valor, 2 * valor):
        if a <= valor:
            continue
        complemento = 1 / (1 / valor - 1 / a)
        b = mas_cercano(complemento, serie)
        _considerar(reciproca, [a, b], _limpio(a * b / (a + b)))

    if mejor is None:
        unico = mas_cercano(valor, serie)
        return ("simple", [unico], unico)
    return mejor


_PREFIJOS = ((1e6, "M"), (1e3, "k"), (1.0, ""), (1e-3, "m"), (1e-6, "u"), (1e-9, "n"), (1e-12, "p"))


def formatear(valor: float, unidad: str = "") -> str:
    """Notación de ingeniería en ASCII (33k, 4.7u, 100n): va a parar a
    comentarios del netlist, y ngspice no necesita sorpresas de codificación."""
    if valor == 0:
        return f"0{unidad}"
    if unidad == "ohm" and abs(valor) < 1:
        # "500mohm" se lee como 500 MΩ con demasiada facilidad.
        return f"{valor:.3g}{unidad}"
    for escala, prefijo in _PREFIJOS:
        if abs(valor) >= escala * 0.9999:
            numero = f"{valor / escala:.3g}"
            return f"{numero}{prefijo}{unidad}"
    return f"{valor:.3g}{unidad}"
