"""Motor simbólico: análisis nodal modificado en el dominio s.

Convive con el análisis de redes pasivas (`ecuaciones.py`, `reduccion.py`,
`thevenin.py`), que se queda para mallas y reducción paso a paso. Este motor
cubre lo que aquel no acepta y que es la mayoría de los problemas de un
curso de op-amps:

- fuentes controladas E (VCVS), G (VCCS), F (CCCS) y H (CCVS);
- op-amps `X<n> <in+> <in-> <out> OPAMP [a=… rd=… ro=…]`: sin parámetros es
  ideal (nulator-norator: V(in+) = V(in-), corriente de salida libre); con
  `a` es la VCVS interna de ganancia a, con `rd` entre las entradas y `ro`
  en serie con la salida, como el modelo del Franco (Fig. 1.5);
- valores numéricos o simbólicos (`{Ri}`), para resolver en letras;
- dominio s (`sL`, `1/sC`) además de DC.

Las convenciones de signo son las de SPICE: la corriente de un elemento va
de su primer nodo al segundo *por dentro* del elemento. Así `I(V1)` es la
corriente que entra por el borne + de V1, `I1 b a 1m` inyecta 1 mA en `a`, y
`G 0 o i 0 gm` inyecta gm·V(i) en `o`.
"""

import os
import re
import tempfile
from dataclasses import dataclass, field

import sympy as sp

from agents.analisis.red import TIERRA, RedInvalida, valor_spice
from agents.shell.ngspice_runner import run_ngspice

S = sp.Symbol("s")

# Un op-amp ideal se simula en ngspice como una VCVS de esta ganancia: el
# error frente al ideal queda en el orden de 1e-9, muy por debajo de la
# tolerancia de la verificación.
_GANANCIA_IDEAL = 1e9
_TOLERANCIA = 1e-3

_TIPOS = "RLCVIEGFHX"


@dataclass(frozen=True)
class Componente:
    nombre: str
    tipo: str  # R L C V I E G F H X
    nodos: tuple[str, ...]  # E/G: (n+, n-, nc+, nc-); X: (in+, in-, out); resto: (n+, n-)
    valor: sp.Expr | None = None  # en fuentes, el valor DC
    control: str | None = None  # F/H: la fuente de tensión que mide la corriente
    params: dict = field(default_factory=dict, compare=False)  # X: a, rd, ro; V/I: ac


@dataclass
class SolucionSimbolica:
    dominio: str  # "dc" o "s"
    ecuaciones: list[sp.Eq]
    tensiones: dict[str, sp.Expr]  # nodo -> tensión respecto de 0
    corrientes: dict[str, sp.Expr]  # elemento -> corriente de su n+ a su n- por dentro
    circuito: list[Componente]


def _nodo(texto: str) -> str:
    return TIERRA if texto.lower() in ("0", "gnd") else texto


_EXPRESION_SEGURA = re.compile(r"[A-Za-z0-9_.+\-*/^() ,]*")


def expresion_segura(texto: str) -> str:
    """El texto viene del LLM y sympify lo evalúa como Python: solo pasan
    letras, números y operadores aritméticos, sin dobles guiones bajos."""
    if not _EXPRESION_SEGURA.fullmatch(texto) or "__" in texto:
        raise RedInvalida(f"expresión no permitida: {texto!r}")
    return texto


_FUNCIONES = {"sqrt": sp.sqrt, "pi": sp.pi, "exp": sp.exp, "log": sp.log}


def a_sympy(texto: str, locales: dict | None = None) -> sp.Expr:
    """Texto ya validado -> expresión. Todo identificador es un símbolo: sin
    esto, `I`, `E`, `S` o `N` serían la unidad imaginaria, el número e…"""
    locales = dict(locales or {})
    for nombre in set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", texto)):
        if nombre not in locales:
            locales[nombre] = _FUNCIONES.get(nombre, sp.Symbol(nombre))
    return sp.sympify(texto, locals=locales)


def _valor(texto: str) -> sp.Expr:
    """`4.7k` -> 4700 (racional exacto); `{Ri}` -> Symbol('Ri');
    `{(1-k)*100k}` -> la expresión, con sufijos SPICE dentro."""
    texto = texto.strip()
    if texto.startswith("{") and texto.endswith("}"):
        interior = texto[1:-1].strip()
        if not interior:
            raise RedInvalida(f"símbolo vacío: {texto!r}")
        # sufijos SPICE dentro de la expresión: 100k -> 100000
        interior = re.sub(
            r"(?<![A-Za-z_])(\d*\.?\d+(?:[eE][-+]?\d+)?)(meg|[tgkmunpf])(?![A-Za-z0-9_])",
            lambda m: repr(valor_spice(m.group(0))),
            interior,
            flags=re.IGNORECASE,
        )
        try:
            return sp.nsimplify(a_sympy(expresion_segura(interior)), rational=True)
        except (sp.SympifyError, SyntaxError, TypeError) as exc:
            raise RedInvalida(f"valor inválido: {texto!r}") from exc
    if texto.lower() in ("inf", "infinito", "∞"):
        return sp.oo
    return sp.nsimplify(valor_spice(texto), rational=True)


def _es_elemento(tokens: list[str]) -> bool:
    """¿Parece un elemento SPICE (cualquiera, no solo los que el motor
    resuelve)? Sirve para no confundir un `Q1 c b e NPN` con el título."""
    return (
        len(tokens) >= 3
        and tokens[0][0].upper() in "RLCVIQDMJXEFGHBKSTWZ"
        and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", tokens[0]) is not None
    )


def leer_circuito(netlist: str) -> list[Componente]:
    """Componentes del netlist, en orden. Ignora título, comentarios,
    directivas y bloques `.control`; rechaza con un mensaje claro lo que el
    motor no sabe resolver (transistores, diodos, subcircuitos que no sean
    OPAMP)."""
    componentes: list[Componente] = []
    dentro_control = False
    dentro_subckt = False
    for numero, cruda in enumerate(netlist.splitlines()):
        linea = cruda.split(";")[0].strip()
        if not linea or linea.startswith(("*", "+")):
            continue
        baja = linea.lower()
        # Un `.subckt OPAMP` escrito por el LLM no es el op-amp del motor: sus
        # elementos internos no son parte del circuito (quedarían flotando).
        if baja.startswith(".subckt"):
            partes = baja.split()
            if len(partes) < 2 or partes[1] != "opamp":
                raise RedInvalida(
                    f"{linea}: el motor no resuelve subcircuitos; el op-amp se escribe "
                    "`X1 in+ in- out OPAMP` (con a=, rd=, ro= si no es ideal)"
                )
            dentro_subckt = True
            continue
        if baja.startswith(".ends"):
            dentro_subckt = False
            continue
        if dentro_subckt:
            continue
        if baja.startswith(".control"):
            dentro_control = True
            continue
        if baja.startswith(".endc"):
            dentro_control = False
            continue
        if dentro_control or baja.startswith("."):
            continue
        tokens = linea.split()
        if numero == 0 and not _es_elemento(tokens):
            continue  # título
        componentes.append(_leer_linea(tokens, linea))
    if not componentes:
        raise RedInvalida("el netlist no tiene elementos")
    nombres = [c.nombre for c in componentes]
    repetidos = sorted({n for n in nombres if nombres.count(n) > 1})
    if repetidos:
        raise RedInvalida(f"elementos repetidos: {', '.join(repetidos)}")
    fuentes_v = {c.nombre for c in componentes if c.tipo == "V"}
    for c in componentes:
        if c.tipo in "FH" and c.control not in fuentes_v:
            raise RedInvalida(f"{c.nombre}: la corriente de control debe ser la de una fuente de tensión del circuito ({c.control} no existe)")
    if not any(TIERRA in c.nodos for c in componentes):
        raise RedInvalida("el circuito no tiene nodo de referencia (0)")
    return componentes


def _leer_linea(tokens: list[str], linea: str) -> Componente:
    nombre = tokens[0].upper()
    tipo = nombre[0]
    if tipo not in _TIPOS:
        raise RedInvalida(
            f"{tokens[0]}: el motor resuelve R, L, C, fuentes independientes, fuentes "
            "controladas (E, G, F, H) y op-amps (X … OPAMP)"
        )
    try:
        if tipo in "RLC":
            return Componente(nombre, tipo, (_nodo(tokens[1]), _nodo(tokens[2])), _valor(tokens[3]))
        if tipo in "VI":
            resto = tokens[3:]
            dc, ac = None, None
            k = 0
            while k < len(resto):
                palabra = resto[k].upper()
                if palabra == "DC" and k + 1 < len(resto):
                    dc = _valor(resto[k + 1])
                    k += 2
                elif palabra == "AC" and k + 1 < len(resto):
                    ac = _valor(resto[k + 1])
                    k += 2
                elif dc is None:
                    dc = _valor(resto[k])
                    k += 1
                else:
                    k += 1
            if dc is None and ac is None:
                raise RedInvalida(f"{nombre} sin valor")
            params = {"ac": ac} if ac is not None else {}
            return Componente(nombre, tipo, (_nodo(tokens[1]), _nodo(tokens[2])), dc if dc is not None else sp.Integer(0), params=params)
        if tipo in "EG":
            nodos = tuple(_nodo(t) for t in tokens[1:5])
            return Componente(nombre, tipo, nodos, _valor(tokens[5]))
        if tipo in "FH":
            return Componente(nombre, tipo, (_nodo(tokens[1]), _nodo(tokens[2])), _valor(tokens[4]), control=tokens[3].upper())
        # X: subcircuito; el único que se entiende es OPAMP
        pos = next((k for k, t in enumerate(tokens) if t.upper() == "OPAMP"), None)
        if pos is None:
            raise RedInvalida(f"{nombre}: el único subcircuito que se resuelve es OPAMP (`X1 in+ in- out OPAMP`)")
        nodos = tuple(_nodo(t) for t in tokens[1:pos])
        if len(nodos) != 3:
            raise RedInvalida(f"{nombre}: un OPAMP lleva tres nodos (in+ in- out), no {len(nodos)}")
        params = {}
        for par in tokens[pos + 1 :]:
            if "=" not in par:
                raise RedInvalida(f"{nombre}: parámetro {par!r} sin '='")
            clave, valor = par.split("=", 1)
            clave = clave.lower()
            if clave not in ("a", "rd", "ro"):
                raise RedInvalida(f"{nombre}: parámetro desconocido {clave!r} (se aceptan a, rd, ro)")
            params[clave] = _valor(valor)
        return Componente(nombre, "X", nodos, params=params)
    except IndexError:
        raise RedInvalida(f"línea incompleta: {linea!r}") from None


def _expandir(circuito: list[Componente]) -> list[Componente]:
    """El op-amp no ideal como sus partes: rd entre entradas, la VCVS de
    ganancia a y ro en serie con la salida. El ideal queda como X."""
    primitivos: list[Componente] = []
    for c in circuito:
        a = c.params.get("a") if c.tipo == "X" else None
        if c.tipo != "X" or a is None or a == sp.oo:
            primitivos.append(c if c.tipo != "X" else Componente(c.nombre, "X", c.nodos))
            continue
        mas, menos, salida = c.nodos
        rd, ro = c.params.get("rd"), c.params.get("ro")
        # El nombre de cada parte empieza con la letra de su tipo: ngspice
        # tomaría "X1_RD" por un subcircuito.
        if rd is not None and rd != sp.oo:
            primitivos.append(Componente(f"R{c.nombre}_RD", "R", (mas, menos), rd))
        interno = salida if ro is None or ro == 0 else f"{c.nombre}_int"
        primitivos.append(Componente(f"E{c.nombre}_A", "E", (interno, TIERRA, mas, menos), a))
        if interno != salida:
            primitivos.append(Componente(f"R{c.nombre}_RO", "R", (interno, salida), ro))
    return primitivos


def resolver(circuito: list[Componente], dominio: str = "dc") -> SolucionSimbolica:
    """MNA: KCL en cada nodo más una ecuación por cada elemento que fija una
    tensión (V, E, H, L, op-amp ideal). En "dc" s = 0 (C abierto, L corto);
    en "s" queda la variable de Laplace."""
    s = sp.Integer(0) if dominio == "dc" else S
    primitivos = _expandir(circuito)
    lista_nodos: list[str] = []
    for c in primitivos:
        for n in c.nodos:
            if n != TIERRA and n not in lista_nodos:
                lista_nodos.append(n)
    v = {n: sp.Symbol(f"V_{n}") for n in lista_nodos}
    v[TIERRA] = sp.Integer(0)
    i_libre = {c.nombre: sp.Symbol(f"I_{c.nombre}") for c in primitivos if c.tipo in "VEHLX"}

    def fuente(c: Componente) -> sp.Expr:
        return c.params.get("ac", c.valor) if dominio == "s" else c.valor

    def corriente(c: Componente) -> sp.Expr:
        """De nodos[0] a nodos[1] por dentro del elemento (X: de 0 a la salida)."""
        a, b = c.nodos[0], c.nodos[1]
        if c.tipo == "R":
            return (v[a] - v[b]) / c.valor
        if c.tipo == "C":
            return (v[a] - v[b]) * s * c.valor
        if c.tipo == "I":
            return fuente(c)
        if c.tipo == "G":
            return c.valor * (v[c.nodos[2]] - v[c.nodos[3]])
        if c.tipo == "F":
            return c.valor * i_libre[c.control]
        return i_libre[c.nombre]  # V, E, H, L, X

    ecuaciones: list[sp.Eq] = []
    for n in lista_nodos:
        saliente = sp.Integer(0)
        for c in primitivos:
            if c.tipo == "X":
                if c.nodos[2] == n:
                    saliente -= corriente(c)  # la salida entrega I_X al nodo
                continue
            if c.nodos[0] == n:
                saliente += corriente(c)
            if c.nodos[1] == n:
                saliente -= corriente(c)
        ecuaciones.append(sp.Eq(saliente, 0))
    for c in primitivos:
        if c.tipo == "V":
            ecuaciones.append(sp.Eq(v[c.nodos[0]] - v[c.nodos[1]], fuente(c)))
        elif c.tipo == "E":
            ecuaciones.append(sp.Eq(v[c.nodos[0]] - v[c.nodos[1]], c.valor * (v[c.nodos[2]] - v[c.nodos[3]])))
        elif c.tipo == "H":
            ecuaciones.append(sp.Eq(v[c.nodos[0]] - v[c.nodos[1]], c.valor * i_libre[c.control]))
        elif c.tipo == "L":
            ecuaciones.append(sp.Eq(v[c.nodos[0]] - v[c.nodos[1]], s * c.valor * i_libre[c.nombre]))
        elif c.tipo == "X":
            ecuaciones.append(sp.Eq(v[c.nodos[0]] - v[c.nodos[1]], 0))

    incognitas = [v[n] for n in lista_nodos] + list(i_libre.values())
    soluciones = sp.linsolve(ecuaciones, incognitas)
    if not soluciones:
        raise RedInvalida(
            "el sistema es singular: hay un lazo de fuentes de tensión, un corte de "
            "fuentes de corriente o un op-amp sin realimentación que lo cierre"
        )
    (valores,) = soluciones
    resuelto = dict(zip(incognitas, valores))
    libres = set().union(*(sp.sympify(x).free_symbols for x in valores)) & set(incognitas)
    if libres:
        raise RedInvalida("el sistema es singular: hay un nodo flotante o una corriente indeterminada")
    tensiones = {n: sp.simplify(resuelto[v[n]]) for n in lista_nodos}
    corrientes = {c.nombre: sp.simplify(corriente(c).subs(resuelto)) for c in primitivos}
    return SolucionSimbolica(dominio, ecuaciones, tensiones, corrientes, circuito)


_V = re.compile(r"\bV\(\s*([^,()\s]+)\s*(?:,\s*([^,()\s]+)\s*)?\)", re.IGNORECASE)
_I = re.compile(r"\bI\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)", re.IGNORECASE)


def evaluar(solucion: SolucionSimbolica, expresion: str) -> sp.Expr:
    """`V(o)`, `V(a,b)`, `I(R1)` y aritmética con ellos o con símbolos."""
    locales: dict[str, sp.Expr] = {}

    def tension(nodo: str) -> sp.Expr:
        nodo = _nodo(nodo)
        if nodo == TIERRA:
            return sp.Integer(0)
        if nodo not in solucion.tensiones:
            raise RedInvalida(f"V({nodo}): no es un nodo del circuito")
        return solucion.tensiones[nodo]

    def sustituir_v(m: re.Match) -> str:
        clave = f"__v{len(locales)}"
        valor = tension(m.group(1)) - (tension(m.group(2)) if m.group(2) else 0)
        locales[clave] = valor
        return f"({clave})"

    def sustituir_i(m: re.Match) -> str:
        nombre = m.group(1).upper()
        if nombre not in solucion.corrientes:
            raise RedInvalida(f"I({m.group(1)}): no es un elemento del circuito")
        clave = f"__i{len(locales)}"
        locales[clave] = solucion.corrientes[nombre]
        return f"({clave})"

    expresion_segura(expresion)
    texto = _I.sub(sustituir_i, _V.sub(sustituir_v, expresion))
    try:
        return sp.simplify(a_sympy(texto, {**locales, "s": S}))
    except (sp.SympifyError, SyntaxError, TypeError) as exc:
        raise RedInvalida(f"no se entiende la expresión {expresion!r}: {exc}") from exc


def _numero(valor: sp.Expr) -> float:
    return float(sp.N(valor))


def _nombre_spice(c: Componente) -> str:
    """Un corto (R = 0) se resuelve como fuente de 0 V; en ngspice su nombre
    tiene que empezar con la letra de su tipo."""
    return c.nombre if c.nombre[0] == c.tipo else f"{c.tipo}{c.nombre}"


def netlist_ngspice(
    circuito: list[Componente], titulo: str = "Verificacion", frecuencias: list[float] | None = None
) -> str:
    """El circuito para ngspice, con el op-amp ideal como VCVS de ganancia
    1e9 y el no ideal como sus partes.

    En DC escribe en output.txt la tensión de cada nodo (`<nodo> <valor>`) y
    la corriente de cada fuente de tensión (`I:<nombre> <valor>`). Con
    `frecuencias` corre un `.ac` por frecuencia y escribe `ac_<k>.txt` con
    `wrdata` (ternas frecuencia, real, imaginario por vector, en el orden:
    nodos y luego corrientes de las fuentes de tensión)."""
    if frecuencias:
        return _netlist_ac(circuito, titulo, frecuencias)
    lineas = [f"* {titulo}"]
    nodos: list[str] = []
    fuentes_v: list[Componente] = []
    nombres = {c.nombre: _nombre_spice(c) for c in _expandir(circuito)}
    for c in _expandir(circuito):
        for n in c.nodos:
            if n != TIERRA and n not in nodos:
                nodos.append(n)
        nombre = nombres[c.nombre]
        if c.tipo in "RLC":
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} {_numero(c.valor):.12g}")
        elif c.tipo in "VI":
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} DC {_numero(c.valor):.12g}")
            if c.tipo == "V":
                fuentes_v.append(c)
        elif c.tipo in "EG":
            lineas.append(f"{nombre} {' '.join(c.nodos)} {_numero(c.valor):.12g}")
        elif c.tipo in "FH":
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} {nombres.get(c.control, c.control)} {_numero(c.valor):.12g}")
        elif c.tipo == "X":
            mas, menos, salida = c.nodos
            lineas.append(f"E{c.nombre} {salida} 0 {mas} {menos} {_GANANCIA_IDEAL:g}")
    lineas += [".control", "op"]
    k = 0
    for n in nodos:
        lineas += [f"let m_{k} = v({n})", f"echo {n} $&m_{k} {'>' if k == 0 else '>>'} output.txt"]
        k += 1
    for c in fuentes_v:
        lineas += [f"let m_{k} = i({nombres[c.nombre]})", f"echo I:{c.nombre} $&m_{k} {'>' if k == 0 else '>>'} output.txt"]
        k += 1
    lineas += [".endc", ".end", ""]
    return "\n".join(lineas)


def _nodos_y_fuentes(primitivos: list[Componente]) -> tuple[list[str], list[Componente]]:
    nodos: list[str] = []
    for c in primitivos:
        for n in c.nodos:
            if n != TIERRA and n not in nodos:
                nodos.append(n)
    return nodos, [c for c in primitivos if c.tipo == "V"]


def _netlist_ac(circuito: list[Componente], titulo: str, frecuencias: list[float]) -> str:
    primitivos = _expandir(circuito)
    nombres = {c.nombre: _nombre_spice(c) for c in primitivos}
    nodos, fuentes_v = _nodos_y_fuentes(primitivos)
    lineas = [f"* {titulo} (AC)"]
    for c in primitivos:
        nombre = nombres[c.nombre]
        if c.tipo in "RLC":
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} {_numero(c.valor):.12g}")
        elif c.tipo in "VI":
            # la misma amplitud que usó el motor en el dominio s
            ac = c.params.get("ac", c.valor)
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} DC {_numero(c.valor):.12g} AC {_numero(ac):.12g}")
        elif c.tipo in "EG":
            lineas.append(f"{nombre} {' '.join(c.nodos)} {_numero(c.valor):.12g}")
        elif c.tipo in "FH":
            lineas.append(f"{nombre} {c.nodos[0]} {c.nodos[1]} {nombres.get(c.control, c.control)} {_numero(c.valor):.12g}")
        elif c.tipo == "X":
            mas, menos, salida = c.nodos
            lineas.append(f"E{c.nombre} {salida} 0 {mas} {menos} {_GANANCIA_IDEAL:g}")
    vectores = " ".join([f"v({n})" for n in nodos] + [f"i({nombres[c.nombre]})" for c in fuentes_v])
    lineas.append(".control")
    for k, f in enumerate(frecuencias):
        lineas += [f"ac lin 1 {f:.12g} {f:.12g}", f"wrdata ac_{k}.txt {vectores}"]
    lineas += ["echo listo > output.txt", ".endc", ".end", ""]
    return "\n".join(lineas)


def medir_ac(
    circuito: list[Componente], frecuencias: list[float]
) -> tuple[str | None, list[tuple[float, SolucionSimbolica]] | None, str | None]:
    """(netlist, [(f, solución medida en fasores)], error): lo que ngspice
    mide en cada frecuencia, evaluable con `evaluar` igual que el motor."""
    libres = simbolos_libres(circuito)
    if libres:
        nombres = ", ".join(sorted(str(x) for x in libres))
        return None, None, f"hay valores simbólicos ({nombres}): sin números no hay qué simular"
    texto = netlist_ngspice(circuito, frecuencias=frecuencias)
    directorio = tempfile.mkdtemp(prefix="agents-simbolico-ac-")
    ruta = os.path.join(directorio, "verificacion_ac.cir")
    with open(ruta, "w") as f:
        f.write(texto)
    _, error = run_ngspice(ruta)
    if error is not None:
        return texto, None, error
    primitivos = _expandir(circuito)
    nodos, fuentes_v = _nodos_y_fuentes(primitivos)
    medidas = []
    for k, f in enumerate(frecuencias):
        try:
            with open(os.path.join(directorio, f"ac_{k}.txt")) as archivo:
                numeros = [float(x) for x in archivo.read().split()]
        except (OSError, ValueError):
            return texto, None, f"ngspice no escribió el barrido AC en {f:g} Hz"
        ternas = [numeros[i : i + 3] for i in range(0, len(numeros), 3)]
        if len(ternas) < len(nodos) + len(fuentes_v):
            return texto, None, f"ngspice devolvió menos vectores de los esperados en {f:g} Hz"
        valores = [complex(t[1], t[2]) for t in ternas]
        tensiones = {n: sp.sympify(valores[i]) for i, n in enumerate(nodos)}
        v = {**tensiones, TIERRA: sp.Integer(0)}
        omega = 2 * sp.pi * f
        corrientes: dict[str, sp.Expr] = {
            c.nombre: sp.sympify(valores[len(nodos) + j]) for j, c in enumerate(fuentes_v)
        }
        for c in primitivos:
            a, b = c.nodos[0], c.nodos[1]
            if c.tipo == "R":
                corrientes[c.nombre] = (v[a] - v[b]) / c.valor
            elif c.tipo == "C":
                corrientes[c.nombre] = (v[a] - v[b]) * sp.I * omega * c.valor
            elif c.tipo == "I":
                corrientes[c.nombre] = c.params.get("ac", c.valor)
            elif c.tipo == "G":
                corrientes[c.nombre] = c.valor * (v[c.nodos[2]] - v[c.nodos[3]])
            elif c.tipo == "F" and c.control in corrientes:
                corrientes[c.nombre] = c.valor * corrientes[c.control]
        medidas.append((f, SolucionSimbolica("ac", [], tensiones, corrientes, circuito)))
    return texto, medidas, None


def simbolos_libres(circuito: list[Componente]) -> set[sp.Symbol]:
    libres: set[sp.Symbol] = set()
    for c in circuito:
        for valor in [c.valor, *c.params.values()]:
            if valor is not None:
                libres |= sp.sympify(valor).free_symbols
    return libres


def medir_con_ngspice(circuito: list[Componente]) -> tuple[str | None, SolucionSimbolica | None, str | None]:
    """(netlist, lo que midió ngspice como solución evaluable, error).

    La solución medida trae las tensiones de nodo de ngspice y las corrientes
    que de ellas se deducen (R, C, I, G, F) o que ngspice reporta (V); con
    ella `evaluar` calcula cualquier medición con los números simulados."""
    libres = simbolos_libres(circuito)
    if libres:
        nombres = ", ".join(sorted(str(x) for x in libres))
        return None, None, f"hay valores simbólicos ({nombres}): sin números no hay qué simular"
    texto = netlist_ngspice(circuito)
    directorio = tempfile.mkdtemp(prefix="agents-simbolico-")
    ruta = os.path.join(directorio, "verificacion.cir")
    with open(ruta, "w") as f:
        f.write(texto)
    salida, error = run_ngspice(ruta)
    if error is not None:
        return texto, None, error
    leido: dict[str, float] = {}
    with open(salida) as f:
        for linea in f:
            partes = linea.split()
            if len(partes) >= 2:
                try:
                    leido[partes[0]] = float(partes[1])
                except ValueError:
                    continue
    primitivos = _expandir(circuito)
    tensiones: dict[str, sp.Expr] = {}
    for c in primitivos:
        for n in c.nodos:
            if n != TIERRA and n not in tensiones:
                medido = leido.get(n, leido.get(n.lower()))
                if medido is None:
                    return texto, None, f"ngspice no reportó V({n})"
                tensiones[n] = sp.Float(medido)
    v = {**tensiones, TIERRA: sp.Integer(0)}
    corrientes: dict[str, sp.Expr] = {}
    for c in primitivos:
        if c.tipo == "V":
            medido = leido.get(f"I:{c.nombre}")
            if medido is not None:
                corrientes[c.nombre] = sp.Float(medido)
    for c in primitivos:
        a, b = c.nodos[0], c.nodos[1]
        if c.tipo == "R":
            corrientes[c.nombre] = (v[a] - v[b]) / c.valor
        elif c.tipo == "C":
            corrientes[c.nombre] = sp.Integer(0)
        elif c.tipo == "I":
            corrientes[c.nombre] = c.valor
        elif c.tipo == "G":
            corrientes[c.nombre] = c.valor * (v[c.nodos[2]] - v[c.nodos[3]])
        elif c.tipo == "F" and c.control in corrientes:
            corrientes[c.nombre] = c.valor * corrientes[c.control]
    return texto, SolucionSimbolica("dc", [], tensiones, corrientes, circuito), None


def verificar_con_ngspice(circuito: list[Componente], solucion: SolucionSimbolica) -> dict:
    """Simula el mismo circuito y compara las tensiones de nodo con las del
    motor. Solo tiene sentido con valores numéricos."""
    texto, medida, error = medir_con_ngspice(circuito)
    if error is not None:
        return {"error": error, "coincide": False, "tensiones": {}, "netlist": texto}
    esperadas = {n: _numero(x.subs(S, 0)) for n, x in solucion.tensiones.items()}
    comunes = [n for n in esperadas if n in medida.tensiones]
    coincide = bool(comunes) and all(
        coinciden(_numero(medida.tensiones[n]), esperadas[n]) for n in comunes
    )
    tensiones = {n: _numero(medida.tensiones[n]) for n in comunes}
    return {"error": None, "coincide": coincide, "tensiones": tensiones, "netlist": texto}


def coinciden(medido: float, esperado: float) -> bool:
    """Relativo (0.1 %) con un piso absoluto de 1 µ: una tierra virtual sale
    en ngspice como unos nV (el op-amp ideal se simula con ganancia 1e9)."""
    return abs(medido - esperado) <= max(_TOLERANCIA * abs(esperado), 1e-6)
