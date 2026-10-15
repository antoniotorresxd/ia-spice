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

import cmath
import itertools
import math
import re
from dataclasses import replace

import sympy as sp

from agents.analisis.cobertura import faltantes, lineas_requisitos
from agents.analisis.red import RedInvalida, _ingenieria, fmt
from agents.analisis.simbolico import (
    _PUERTO,
    circuito_de_puerto,
    valor_de_puerto,
    S,
    Componente,
    _valor,
    a_sympy,
    coinciden,
    evaluar,
    expresion_segura,
    leer_circuito,
    medir_ac,
    medir_con_ngspice,
    resolver,
    simbolos_libres,
)
from agents.analisis.transferencia import (
    caracterizar,
    en_frecuencia,
    expandir_funciones,
    rango_bode,
    tiene_funciones,
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


class _Caso:
    """Un escenario o una pregunta: el circuito con sus valores y, a pedido,
    su solución en DC y en s (se calculan una sola vez; un integrador no
    tiene solución DC y no hace falta pedírsela si no se usa)."""

    def __init__(self, circuito: list[Componente], valores: dict, nombre: str = ""):
        self.circuito, self.abiertos = _sustituir(circuito, valores)
        self.nombre = nombre
        self.cortos = [c.nombre for c in self.circuito if c.tipo == "V" and c.nombre[0] != "V"]
        self._dc = None
        self._s = None

    def _resolver(self, dominio: str):
        try:
            return self._abrir(resolver(self.circuito, dominio=dominio))
        except RedInvalida as exc:
            # El error del motor es genérico; con qué escenario y qué quedó en
            # corto o abierto se entiende qué está mal en la transcripción.
            detalle = []
            if self.cortos:
                detalle.append(f"{', '.join(self.cortos)} queda en corto (0 Ω)")
            if self.abiertos:
                detalle.append(f"{', '.join(sorted(self.abiertos))} queda abierta")
            donde = f"en «{self.nombre}»" if self.nombre else "con estos valores"
            pista = f" ({'; '.join(detalle)})" if detalle else ""
            raise RedInvalida(
                f"{donde}{pista} {exc}. Revisa la topología transcrita: así el circuito no tiene solución"
            ) from exc

    def _abrir(self, solucion):
        for nombre in self.abiertos:
            solucion.corrientes.setdefault(nombre, sp.Integer(0))
        return solucion

    def dc(self):
        if self._dc is None:
            self._dc = self._resolver("dc")
        return self._dc

    def s(self):
        if self._s is None:
            self._s = self._resolver("s")
        return self._s

    def calcular(self, expresion: str) -> sp.Expr:
        """Una expresión del motor; si trae f0(…), Q(…), db(…, f)… esos
        términos se evalúan en el dominio s, y Rin(…)/Rout(…) en su propio
        circuito de puerto."""
        expresion, puertos = _sustituir_puertos(self.circuito, expresion, lambda c: resolver(c, dominio="dc"))
        if puertos:
            return self.calcular(expresion).subs(puertos)
        if not tiene_funciones(expresion):
            return evaluar(self.dc(), expresion) if _usa_circuito(expresion) else a_sympy(expresion_segura(expresion))
        texto, valores, _ = expandir_funciones(expresion, lambda a: evaluar(self.s(), a), _cantidad)
        resto = evaluar(self.dc(), texto) if _usa_circuito(texto) else a_sympy(texto)
        return sp.simplify(resto.subs({sp.Symbol(k): v for k, v in valores.items()}))

    def transferencia(self, expresion: str) -> sp.Expr:
        return sp.simplify(evaluar(self.s(), expresion))


def _sustituir_puertos(circuito, expresion: str, resolver_circuito) -> tuple[str, dict]:
    """Cada Rin(…)/Rout(…) se resuelve en su circuito de puerto con
    `resolver_circuito` (el motor o ngspice) y queda en la expresión como un
    símbolo PUERTO<k>, con su valor en el diccionario."""
    valores: dict = {}

    def sustituir(m: re.Match) -> str:
        simbolo = sp.Symbol(f"PUERTO{len(valores)}")
        solucion = resolver_circuito(circuito_de_puerto(circuito, m.group(1), m.group(2)))
        valores[simbolo] = valor_de_puerto(solucion, m.group(1), m.group(2))
        return str(simbolo)

    return _PUERTO.sub(sustituir, expresion), valores


def _usa_circuito(expresion: str):
    return re.search(r"\b(?:[VI]|Rin|Rout|IO|ICC|IEE|POA|PUERTO\d+)\s*\(|\bPUERTO\d+\b", expresion, re.IGNORECASE)


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


# Rango práctico de resistencias con op-amps: por debajo cargan la salida,
# por encima pesan el ruido y las corrientes de polarización. El centro es
# donde suelen caer las soluciones de libro (Franco: 15k-120k).
_RANGO_PRACTICO = (1e3, 1e6)
_CENTRO_PRACTICO = 30e3


def _rareza(r: float) -> int:
    """0 si el valor está en E6, 1 en E12, 2 en E24, 3 si no: entre dos
    juegos igual de exactos, quien diseña prefiere los valores más comunes
    (Franco ej. 1.5: 10k, 200k y 100k antes que 7.5k, 150k y 75k)."""
    from agents.comerciales.series import error_relativo, mas_cercano

    for rareza, serie in enumerate(("E6", "E12", "E24")):
        if abs(error_relativo(mas_cercano(r, serie), r)) < 1e-9:
            return rareza
    return 3


def _elegir_de_la_serie(soluciones: list[dict], incognitas: list[sp.Symbol], serie: str) -> tuple[dict, sp.Symbol] | None:
    """Cuando las mediciones dejan libre una incógnita que es una resistencia
    ("vO = -(6v1 + 8v2 + 4v3)" fija R1, R2 y R3 en función de RF), la elige
    quien diseña: el valor de la serie que deja TODAS las resistencias en la
    serie (o lo más cerca), dentro del rango práctico. Franco ej. 1.4:
    RF = 120k da R1 = 20k, R2 = 15k y R3 = 30k, todas E24. Entre juegos igual
    de exactos gana el de valores más comunes y después el más cercano al
    centro del rango práctico."""
    from agents.comerciales.series import error_relativo, mas_cercano, valores_en_rango

    # Solo en un diseño de resistencias: si entre las incógnitas hay una
    # ganancia u otro parámetro de un modelo (Aoc, Ag), lo que queda libre
    # es un dato que falta, no una elección.
    if not all(str(i).upper().startswith("R") for i in incognitas):
        return None
    candidatos = valores_en_rango(serie, *_RANGO_PRACTICO)
    mejor, mejor_puntaje, libre = None, None, None
    for solucion in soluciones:
        faltan = [i for i in incognitas if i not in solucion]
        libres = {x for v in solucion.values() for x in sp.sympify(v).free_symbols}
        if len(faltan) != 1 or not libres <= set(faltan) or not str(faltan[0]).upper().startswith("R"):
            continue
        x = faltan[0]
        resistencias = [i for i in incognitas if str(i).upper().startswith("R")]
        for v in candidatos:
            valores = {i: sp.N(e.subs(x, v)) for i, e in solucion.items()}
            valores[x] = sp.Float(v)
            if not all(valores[i].is_real and valores[i] > 0 for i in incognitas):
                continue
            rs = [float(valores[i]) for i in resistencias]
            fuera = any(not (_RANGO_PRACTICO[0] <= r <= _RANGO_PRACTICO[1]) for r in rs)
            error = max(abs(error_relativo(mas_cercano(r, serie), r)) for r in rs)
            media = math.exp(sum(math.log(r) for r in rs) / len(rs))
            puntaje = (fuera, round(error, 6), sum(_rareza(r) for r in rs), abs(math.log(media / _CENTRO_PRACTICO)))
            if mejor_puntaje is None or puntaje < mejor_puntaje:
                exactos = {i: e.subs(x, sp.nsimplify(v, rational=True)) for i, e in solucion.items()}
                exactos[x] = sp.nsimplify(v, rational=True)
                mejor, mejor_puntaje, libre = exactos, puntaje, x
    return (mejor, libre) if mejor is not None else None


def _resolver_incognitas(
    ecuaciones: list[sp.Eq], incognitas: list[sp.Symbol], serie: str = "E24"
) -> tuple[dict, str | None, dict | None]:
    if not ecuaciones:
        return {}, "faltan datos: no hay mediciones para deducir las incógnitas", None
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
        return {}, "las mediciones son incompatibles entre sí: no hay valores que las cumplan todas", None
    elegida = _elegir(soluciones, incognitas)
    if elegida is None:
        comercial = _elegir_de_la_serie(soluciones, incognitas, serie)
        if comercial is not None:
            valores, libre = comercial
            return valores, None, {"simbolo": str(libre), "serie": serie}
        libres = sorted({str(x) for s in soluciones for x in incognitas if x not in s})
        return {}, f"faltan datos: con estas mediciones quedan libres {', '.join(libres)}", None
    libres = sorted({str(x) for v in elegida.values() for x in sp.sympify(v).free_symbols})
    if libres:
        return {}, f"faltan datos: con estas mediciones quedan libres {', '.join(libres)}", None
    return elegida, None, None


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
        nombre = escenario.get("nombre") or f"escenario {k + 1}"
        caso = _Caso(circuito, _valores(escenario.get("valores")), nombre)
        filas = []
        for expresion, medido in (escenario.get("mediciones") or {}).items():
            ecuacion = sp.Eq(caso.calcular(expresion), _cantidad(medido))
            ecuaciones.append(ecuacion)
            filas.append({"expresion": expresion, "ecuacion": ecuacion, "medido": _a_float(_cantidad(medido))})
        planteados.append({"nombre": nombre, "valores": escenario.get("valores") or {}, "ecuaciones": filas})

    resueltas: dict = {}
    eleccion = None
    if incognitas:
        resueltas, error, eleccion = _resolver_incognitas(ecuaciones, incognitas, spec.get("serie_resistencias") or "E24")
        if error:
            return {"error": error, "incognitas": {}, "escenarios": planteados, "preguntas": [], "verificacion": {"coincide": False, "escenarios": [], "preguntas": []}}

    # 2. Las preguntas, con las incógnitas ya resueltas.
    respuestas = []
    for k, pregunta in enumerate(preguntas):
        caso = _Caso(circuito, {**resueltas, **_valores(pregunta.get("valores"))}, pregunta.get("nombre") or f"pregunta {k + 1}")
        respuesta = {
            "nombre": pregunta.get("nombre") or f"pregunta {k + 1}",
            "calcular": pregunta["calcular"],
            "valores": pregunta.get("valores") or {},
            "tipo": pregunta.get("tipo") or "valor",
        }
        if respuesta["tipo"] == "transferencia":
            h = caso.transferencia(pregunta["calcular"]).subs(resueltas)
            respuesta["expresion"] = h
            respuesta["transferencia"] = caracterizar(h)
            respuesta["valor"] = respuesta["transferencia"]["h"]
        else:
            valor = caso.calcular(pregunta["calcular"]).subs(resueltas)
            respuesta["expresion"] = valor
            respuesta["valor"] = _a_float(valor)
        respuestas.append(respuesta)

    # 3. ngspice: cada escenario reproduce sus mediciones, cada pregunta su valor.
    verificacion = _verificar(circuito, resueltas, escenarios, preguntas, respuestas)
    return {
        "error": None,
        "avisos": _avisos_saturacion(circuito, resueltas, escenarios + preguntas),
        "incognitas": {str(k): _a_float(v) for k, v in resueltas.items()},
        # la incógnita que dejaron libre las mediciones y se eligió de la serie
        "eleccion": eleccion,
        "escenarios": planteados,
        "preguntas": respuestas,
        "verificacion": verificacion,
    }


def _avisos_saturacion(circuito, resueltas: dict, casos: list[dict]) -> list[str]:
    """Un op-amp con su alimentación declarada (vcc=, vee=) cuya salida cae
    fuera de los rieles está saturado: el resultado lineal (el del modelo
    ideal y el de ngspice, que tampoco satura) no describe el circuito real."""
    alimentados = [c for c in circuito if c.tipo == "X" and "vcc" in c.params and "vee" in c.params]
    avisos = []
    for k, caso_spec in enumerate(casos):
        if not alimentados:
            break
        nombre = caso_spec.get("nombre") or f"caso {k + 1}"
        try:
            caso = _Caso(circuito, {**resueltas, **_valores(caso_spec.get("valores"))}, nombre)
            tensiones = caso.dc().tensiones
        except RedInvalida:
            continue
        for x in alimentados:
            vo = tensiones.get(x.nodos[2])
            if vo is None or vo.free_symbols:
                continue
            vo, vcc, vee = float(sp.N(vo)), float(sp.N(x.params["vcc"])), float(sp.N(x.params["vee"]))
            if not vee < vo < vcc:
                avisos.append(
                    f"en «{nombre}» la salida de {x.nombre} daría {vo:.4g} V, fuera de la alimentación "
                    f"({vee:g} V a {vcc:g} V): el op-amp satura y el resultado lineal no vale"
                )
    return avisos


# --- verificación con ngspice ----------------------------------------------------------


def _medir_puerto(circuito):
    _, medida, error = medir_con_ngspice(circuito)
    if error:
        raise RedInvalida(error)
    return medida


def _medir_dc(caso: _Caso, expresion: str):
    try:
        expresion, puertos = _sustituir_puertos(caso.circuito, expresion, _medir_puerto)
    except RedInvalida as exc:
        return None, None, f"no se puede medir con ngspice ({exc})"
    texto, medida, error = medir_con_ngspice(caso.circuito)
    if error:
        return texto, None, error
    try:
        for nombre in caso.abiertos:
            medida.corrientes.setdefault(nombre, sp.Integer(0))
        return texto, float(sp.N(evaluar(medida, expresion).subs(puertos))), None
    except (RedInvalida, KeyError, TypeError) as exc:
        return texto, None, f"no se puede medir {expresion} con ngspice ({exc})"


def _frecuencias(h: sp.Expr, extra: list[float]) -> list[float]:
    fmin, fmax = rango_bode(h)
    puntos = [fmin * (fmax / fmin) ** (k / 4) for k in range(5)]
    return sorted(set(puntos + extra))


def _comparar_h(caso: _Caso, argumento: str, h: sp.Expr, frecuencias: list[float]):
    """¿La H(s) del motor coincide con lo que mide ngspice en cada
    frecuencia? Devuelve (netlist, {f: H medida}, error)."""
    texto, medidas, error = medir_ac(caso.circuito, frecuencias)
    if error:
        return texto, None, error
    medidas_h = {}
    for f, medida in medidas:
        for nombre in caso.abiertos:
            medida.corrientes.setdefault(nombre, sp.Integer(0))
        try:
            medido = complex(sp.N(evaluar(medida, argumento)))
        except (RedInvalida, KeyError, TypeError) as exc:
            return texto, None, f"no se puede medir {argumento} con ngspice ({exc})"
        esperado = complex(sp.N(en_frecuencia(h, f)))
        if abs(medido - esperado) > max(1e-3 * abs(esperado), 1e-9):
            return texto, None, f"en {f:.4g} Hz ngspice da {abs(medido):.4g}∠{math.degrees(cmath.phase(medido)):.1f}° y el análisis {abs(esperado):.4g}∠{math.degrees(cmath.phase(esperado)):.1f}°"
        medidas_h[f] = medido
    return texto, medidas_h, None


def _medir_s(caso: _Caso, expresion: str, resueltas: dict):
    """Una expresión con funciones de s: cada H(s) se contrasta con un
    barrido .ac; mag/db/fase se recalculan con lo medido, y f0/Q/H0 quedan
    verificados a través de su H."""
    texto, valores, llamadas = expandir_funciones(expresion, lambda a: evaluar(caso.s(), a), _cantidad)
    netlist, sustitutos, frecuencias_usadas = None, {}, []
    for k, llamada in enumerate(llamadas):
        h = sp.simplify(llamada["h"].subs(resueltas))
        if (h.free_symbols - {S}):
            return None, None, "la transferencia es simbólica: sin números no hay qué simular", []
        extra = [float(sp.N(llamada["frecuencia"]))] if llamada["frecuencia"] is not None else []
        frecuencias = _frecuencias(h, extra)
        frecuencias_usadas += frecuencias
        netlist, medidas_h, error = _comparar_h(caso, llamada["argumento"], h, frecuencias)
        if error:
            return netlist, None, error, frecuencias_usadas
        marcador = sp.Symbol(f"_t{k}")
        if llamada["frecuencia"] is not None:
            medido = medidas_h[extra[0]]
            sustitutos[marcador] = {
                "mag": abs(medido),
                "db": 20 * math.log10(abs(medido)) if abs(medido) > 0 else -300.0,
                "fase": math.degrees(cmath.phase(medido)),
            }[llamada["funcion"]]
        else:
            sustitutos[marcador] = valores[str(marcador)].subs(resueltas)
    if _usa_circuito(texto):
        return netlist, None, "no se verifica una expresión que mezcla funciones de s con tensiones DC", frecuencias_usadas
    try:
        return netlist, float(sp.N(a_sympy(texto).subs(sustitutos))), None, frecuencias_usadas
    except (TypeError, ValueError) as exc:
        return netlist, None, f"no se pudo evaluar {expresion} con lo medido ({exc})", frecuencias_usadas


def _nominal(simbolo: sp.Symbol) -> sp.Expr:
    """Un valor cualquiera para simular un símbolo del que el resultado no
    depende: 10 k para una resistencia, 1 para lo demás."""
    return sp.Integer(10_000) if str(simbolo).upper().startswith("R") else sp.Integer(1)


def _con_nominales(caso: _Caso, expresion: str) -> _Caso:
    """Un dato que el enunciado deja sin valor pero que no afecta lo medido
    (la Rs de una fuente de corriente que ve una tierra virtual) no impide
    verificar: si la expresión del motor no depende de él, ngspice simula con
    un valor nominal. Si depende, el caso queda igual y la respuesta se
    reporta en letras."""
    libres = simbolos_libres(caso.circuito)
    if not libres:
        return caso
    try:
        depende = caso.calcular(expresion).free_symbols & libres
    except (RedInvalida, KeyError, TypeError, ValueError):
        return caso
    if depende:
        return caso
    return _Caso(caso.circuito, {s: _nominal(s) for s in libres}, caso.nombre)


def _medir(caso: _Caso, expresion: str, resueltas: dict):
    caso = _con_nominales(caso, expresion)
    if tiene_funciones(expresion):
        netlist, simulado, error, _ = _medir_s(caso, expresion, resueltas)
        return netlist, simulado, error
    return _medir_dc(caso, expresion)


def _verificar(circuito, resueltas, escenarios, preguntas, respuestas) -> dict:
    por_escenario, por_pregunta, pruebas = [], [], []
    for escenario in escenarios:
        caso = _Caso(circuito, {**resueltas, **_valores(escenario.get("valores"))})
        filas, netlist = [], None
        for expresion, medido in (escenario.get("mediciones") or {}).items():
            netlist, simulado, error = _medir(caso, expresion, resueltas)
            esperado = float(sp.N(_cantidad(medido)))
            ok = error is None and coinciden(simulado, esperado)
            filas.append({"expresion": expresion, "medido": esperado, "ngspice": simulado, "error": error, "coincide": ok})
        ok = bool(filas) and all(f["coincide"] for f in filas)
        pruebas.append(ok)
        por_escenario.append({"nombre": escenario.get("nombre"), "mediciones": filas, "coincide": ok, "netlist": netlist})
    for pregunta, respuesta in zip(preguntas, respuestas):
        caso = _Caso(circuito, {**resueltas, **_valores(pregunta.get("valores"))})
        if respuesta["tipo"] == "transferencia":
            h = respuesta["expresion"]
            if h.free_symbols - {S}:
                fila = {"nombre": respuesta["nombre"], "ngspice": None, "frecuencias": [], "netlist": None, "coincide": False,
                        "sin_verificar": True, "error": "la transferencia es simbólica: sin números no hay qué simular"}
                por_pregunta.append(fila)
                continue  # una H en letras no se simula, pero tampoco está mal
            frecuencias = _frecuencias(h, [])
            netlist, _, error = _comparar_h(caso, pregunta["calcular"], h, frecuencias)
            ok = error is None
            fila = {"nombre": respuesta["nombre"], "ngspice": None, "frecuencias": frecuencias, "error": error, "coincide": ok, "netlist": netlist}
        else:
            esperado = respuesta["valor"]
            if not isinstance(esperado, float):
                # "V(o) = -10·k·Vin": una respuesta en letras es válida, pero
                # sin números no hay qué simular; no cuenta como prueba.
                por_pregunta.append({"nombre": respuesta["nombre"], "ngspice": None, "netlist": None, "coincide": False,
                                     "sin_verificar": True, "error": "queda en letras: sin números no hay qué simular"})
                continue
            netlist, simulado, error = _medir(caso, pregunta["calcular"], resueltas)
            if _en_letras(error):
                # un valor numérico en un circuito que aún tiene símbolos (V(n-) = 0)
                por_pregunta.append({"nombre": respuesta["nombre"], "ngspice": None, "netlist": None, "coincide": False,
                                     "sin_verificar": True, "error": "el circuito queda en letras: sin números no hay qué simular"})
                continue
            ok = error is None and coinciden(simulado, esperado)
            fila = {"nombre": respuesta["nombre"], "ngspice": simulado, "error": error, "coincide": ok, "netlist": netlist}
        pruebas.append(ok)
        por_pregunta.append(fila)
    return {"coincide": bool(pruebas) and all(pruebas), "concluyente": bool(pruebas), "escenarios": por_escenario, "preguntas": por_pregunta}


def _en_letras(error: str | None) -> bool:
    return bool(error) and "valores simbólicos" in error


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
        "serie_resistencias": outcome.get("serie_resistencias"),
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
            {
                "nombre": p.get("nombre"),
                # una "transferencia" de algo que no es un cociente (V(o) a
                # secas) no tiene H(s): se responde como valor
                "tipo": "transferencia" if p.get("tipo") == "transferencia" and "/" in p["calcular"] else "valor",
                "valores": _lista_a_dict(p.get("valores"), "simbolo", "valor"),
                "calcular": p["calcular"],
            }
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
    """`V(o)/V(i)` -> `V_{o}/V_{i}`, `I(RL)` -> `I_{RL}`, `Rin(V2)` ->
    `R_{in,V2}` para LaTeX."""
    texto = re.sub(r"\bRin\(\s*([^()\s]+)\s*\)", r"R_{in,\1}", expresion, flags=re.IGNORECASE)
    texto = re.sub(r"\bRout\(\s*([^()\s]+)\s*\)", r"R_{out,\1}", texto, flags=re.IGNORECASE)
    # IO(X1) -> i_{O}, ICC(X1) -> i_{CC}, POA(X1) -> p_{OA}, con el op-amp entre corchetes
    texto = re.sub(r"\b(IO|ICC|IEE)\(\s*([^()\s]+)\s*\)", lambda m: f"i_{{{m.group(1)[1:]}}}[{m.group(2)}]", texto, flags=re.IGNORECASE)
    texto = re.sub(r"\bPOA\(\s*([^()\s]+)\s*\)", r"p_{OA}[\1]", texto, flags=re.IGNORECASE)
    texto = re.sub(r"\bV\(\s*([^,()\s]+)\s*,\s*([^,()\s]+)\s*\)", r"V_{\1\2}", texto)
    texto = re.sub(r"\bV\(\s*([^()\s]+)\s*\)", r"V_{\1}", texto)
    texto = re.sub(r"\bI\(\s*([^()\s]+)\s*\)", r"I_{\1}", texto)
    # un guión bajo dentro de un nombre de nodo (nodo_in) es texto, no subíndice
    return re.sub(r"_(?!\{)", r"\\_", texto)


def _lineas_transferencia(p: dict, condiciones: str) -> list[str]:
    """H(s) en forma de libro y sus parámetros, con lo que se pueda decir."""
    t = p["transferencia"]
    h = sp.sympify(t["h"], locals={"s": S})
    lineas = [
        f"**${_tex_expresion(p['calcular'])}$**" + (f" con {condiciones}" if condiciones else "") + f" — {t['tipo']}, orden {t['orden']}:",
        "",
        f"$$H(s) = {_tex(h)}$$",
        "",
    ]
    filas = []
    for clave, etiqueta, unidad in (("h0", "H_0", ""), ("hinf", r"H_\infty", ""), ("f0", "f_0", "Hz"), ("w0", r"\omega_0", "rad/s"), ("q", "Q", "")):
        valor = t.get(clave)
        if valor is None:
            continue
        texto = f"${_tex(valor)}$" if isinstance(valor, str) else fmt(valor if not isinstance(valor, dict) else complex(valor["real"], valor["imag"]), unidad)
        filas.append(f"| ${etiqueta}$ | {texto} |")
    if filas:
        lineas += ["| Parámetro | Valor |", "|---|---|", *filas, ""]
    if t["polos"]:
        lineas.append("Polos: " + ", ".join(_num(x) for x in t["polos"]) + (" · Ceros: " + ", ".join(_num(x) for x in t["ceros"]) if t["ceros"] else "") + ".")
        lineas.append("")
    if t["bode"]:
        lineas.append("_El diagrama de Bode está en la pestaña **Curva de Simulación SPICE**._")
        lineas.append("")
    return lineas


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
        if r.get("eleccion"):
            e = r["eleccion"]
            lineas += [
                f"Las mediciones fijan las razones pero dejan libre ${_tex(sp.Symbol(e['simbolo']))}$: se eligió "
                f"el valor de la serie {e['serie']} que deja todas las resistencias en esa serie (o lo más "
                "cerca), en el rango práctico de 1 kΩ a 1 MΩ.",
                "",
            ]
        seccion += 1

    if r["preguntas"]:
        lineas += [f"## {seccion}. Respuestas", ""]
        seccion += 1
        for p in r["preguntas"]:
            condiciones = ", ".join(f"{k} = {v}" for k, v in p["valores"].items())
            if p.get("tipo") == "transferencia":
                lineas += _lineas_transferencia(p, condiciones)
                continue
            lineas.append(
                f"- ${_tex_expresion(p['calcular'])}$" + (f" con {condiciones}" if condiciones else "") + f" = **{_num(p['valor'])}**"
            )
        lineas.append("")

    for aviso in r.get("avisos") or []:
        lineas += [f"> ⚠ {aviso[0].upper()}{aviso[1:]}.", ""]

    v = r["verificacion"]
    lineas += [f"## {seccion}. Verificación con ngspice", ""]
    filas = [
        (e["nombre"], m["expresion"], m["medido"], m["ngspice"], m["coincide"], m["error"])
        for e in v["escenarios"]
        for m in e["mediciones"]
    ] + [
        (p["nombre"], q["calcular"], q["valor"], p["ngspice"], None if p.get("sin_verificar") else p["coincide"], p["error"])
        for p, q in zip(v["preguntas"], r["preguntas"])
        if q.get("tipo") != "transferencia"
    ]
    for p, q in zip(v["preguntas"], r["preguntas"]):
        if q.get("tipo") == "transferencia":
            if p["coincide"]:
                rango = ", ".join(fmt(f, "Hz") for f in p["frecuencias"])
                lineas.append(f"- $H(s)$ de ${_tex_expresion(q['calcular'])}$: ngspice `.ac` coincide en {rango}. ✓")
            else:
                lineas.append(f"- $H(s)$ de ${_tex_expresion(q['calcular'])}$: {p['error'] or 'no coincide'}.")
    if any(q.get("tipo") == "transferencia" for q in r["preguntas"]):
        lineas.append("")
    if not filas:
        lineas.append("No hubo nada que simular.")
    else:
        lineas += ["| Caso | Magnitud | Esperado | ngspice | |", "|---|---|---|---|---|"]
        for caso, magnitud, esperado, simulado, ok, error in filas:
            simulado_txt = _num(simulado) if simulado is not None else (error or "—")
            marca = "—" if ok is None else ("✓" if ok else "✗")
            lineas.append(f"| {caso} | ${_tex_expresion(magnitud)}$ | {_num(esperado)} | {simulado_txt} | {marca} |")
        lineas.append("")
        if not v.get("concluyente", True):
            lineas.append(
                "No se verificó con ngspice: la respuesta queda en letras. Para simularla, da valores numéricos a los símbolos."
            )
        elif v["coincide"] and any(ok is None for *_, ok, _ in filas):
            en_letras = sum(1 for *_, ok, _ in filas if ok is None)
            lineas.append(
                f"ngspice reproduce todo lo que tiene números; {en_letras} respuesta(s) quedan en letras "
                "y no se pudieron simular."
            )
        else:
            lineas.append(
                "ngspice reproduce todo con los valores encontrados." if v["coincide"] else "ngspice **no** reproduce todo: revisar el planteamiento."
            )
    return "\n".join(lineas)


def _lineas_barrido(b: dict, seccion: int) -> str:
    """La curva contra el parámetro, en el informe: la expresión del motor y
    si ngspice la recorre en los puntos que simuló."""
    simbolo = _tex(sp.Symbol(b["simbolo"]))
    desde, hasta = b["curve"][0]["x"], b["curve"][-1]["x"]
    lineas = [
        "",
        f"## {seccion}. Barrido de ${simbolo}$",
        "",
        f"$${_tex_expresion(b['magnitud'])} = {sp.latex(sp.nsimplify(b['expresion'], rational=True))}$$",
        "",
        f"para ${simbolo}$ de {_num(desde)} a {_num(hasta)} (pestaña *Curva de Simulación SPICE*).",
    ]
    if b["markers"]:
        n = len(b["markers"])
        lineas.append(
            f"ngspice simuló {n} puntos del barrido y " + ("coinciden con la curva. ✓" if b["coincide"] else "**no** coinciden con la curva. ✗")
        )
    return "\n".join(lineas) + "\n"


def _fallas(v: dict) -> list[str]:
    """Lo que ngspice no reprodujo, en una línea por caso, para la autocorrección."""
    fallas = []
    for e in v["escenarios"]:
        for m in e["mediciones"]:
            if not m["coincide"]:
                fallas.append(f"«{e['nombre']}» {m['expresion']}: se esperaba {m['medido']:.4g}, ngspice da " + (f"{m['ngspice']:.4g}" if m["ngspice"] is not None else m["error"] or "nada"))
    for p in v["preguntas"]:
        if not p["coincide"] and p.get("error") and not p.get("sin_verificar"):
            fallas.append(f"«{p['nombre']}»: {p['error']}")
    return fallas


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
    # ¿Quedó todo lo del enunciado? Lo que falte vuelve al orquestador.
    faltan = faltantes(outcome)
    tabla = lineas_requisitos(outcome, faltan)
    if tabla:
        secciones = len(re.findall(r"^## \d+\.", informe, re.MULTILINE))
        informe += f"\n\n## {secciones + 1}. Requisitos del enunciado\n\n" + "\n".join(tabla) + "\n"
    if r["error"]:
        return {"error": r["error"], "informe": informe, "resultados": {}, "netlist": None, "netlist_zeq": None, "formato": "markdown"}
    valores = {sp.Symbol(k): sp.nsimplify(v, rational=True) for k, v in r["incognitas"].items() if isinstance(v, float)}
    primero = (spec["escenarios"] or spec["preguntas"] or [{}])[0]
    for k, v in (primero.get("valores") or {}).items():
        valores[sp.Symbol(k)] = _cantidad(v)
    # La primera transferencia numérica se dibuja como Bode en la pestaña de curva.
    curva = next(
        (
            {"curve": p["transferencia"]["bode"], "metric_name": f"|{p['calcular']}|",
             "analysis_type": "ac", "x_unit": "Hz", "y_unit": "dB", "x_label": "Frecuencia"}
            for p in r["preguntas"]
            if p.get("tipo") == "transferencia" and p["transferencia"]["bode"]
        ),
        None,
    )
    if curva is None:
        # Sin Bode, un problema cuyos casos difieren en un símbolo (el cursor
        # del pot) se grafica contra ese símbolo, con puntos de ngspice encima.
        from agents.analisis.barrido import barrer

        resueltas = {sp.Symbol(k): sp.nsimplify(v, rational=True) for k, v in r["incognitas"].items() if isinstance(v, float)}
        barrido = barrer(leer_circuito(spec["netlist"]), spec, resueltas)
        if barrido:
            curva = {
                "curve": barrido["curve"], "markers": barrido["markers"], "metric_name": barrido["magnitud"],
                "analysis_type": "dc", "x_unit": "", "y_unit": barrido["y_unit"], "x_label": barrido["simbolo"],
            }
            secciones = len(re.findall(r"^## \d+\.", informe, re.MULTILINE))
            informe += _lineas_barrido(barrido, secciones + 1)
    return {
        "error": None,
        "informe": informe,
        "curva": curva,
        "resultados": {
            # sin_verificar: la respuesta quedó en letras, ngspice no tuvo qué simular
            "validacion": {"coincide": r["verificacion"]["coincide"], "error": None,
                           "sin_verificar": not r["verificacion"].get("concluyente", True)},
            "planteamiento": {
                "fallas": _fallas(r["verificacion"]),
                "faltantes": faltan,
                "incognitas": r["incognitas"],
                "preguntas": [{"calcular": p["calcular"], "valor": p["valor"]} for p in r["preguntas"]],
            },
        },
        "netlist": netlist_con_valores(spec["netlist"], valores),
        "netlist_zeq": None,
        "formato": "markdown",
    }
