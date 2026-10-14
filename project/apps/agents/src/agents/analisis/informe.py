"""Punto de entrada del modo análisis y el informe en texto que lo explica."""

import sympy as sp

from agents.analisis.ecuaciones import Solucion, analisis_mallas, analisis_nodal
from agents.analisis.red import TIERRA, RedInvalida, fmt, leer_red, preparar_dc
from agents.analisis.reduccion import reducir
from agents.analisis.thevenin import thevenin
from agents.analisis.validacion import impedancia_con_ngspice, resolver_con_ngspice

METODOS = ("nodos", "mallas", "reduccion", "thevenin")

# Diferencia relativa a partir de la cual el análisis y ngspice "no coinciden".
_TOLERANCIA_VALIDACION = 1e-3


def _ecuacion(eq: sp.Eq) -> str:
    return f"{sp.sstr(eq.lhs)} = {sp.sstr(eq.rhs)}"


def _seccion_solucion(s: Solucion) -> list[str]:
    lineas = ["  Tensiones de nodo (respecto de 0):"]
    lineas += [f"    V({n}) = {fmt(v, 'V')}" for n, v in s.tensiones.items()]
    lineas.append("  Corrientes de rama (de n1 a n2 del netlist):")
    lineas += [f"    I({nombre}) = {fmt(i, 'A')}" for nombre, i in s.corrientes.items()]
    return lineas


def _complejo(valor) -> complex:
    return complex(sp.N(valor))


def analizar(spec: dict) -> dict:
    """Resuelve la red de `spec` con los métodos pedidos.

    `spec`: netlist (texto), metodo ("nodos" | "mallas" | "reduccion" |
    "thevenin" | "completo"), terminales ([a, b], para reducción/Thévenin) y
    frecuencia_hz (None = DC). Nunca lanza: un problema de la red vuelve como
    `error` con el informe que explica qué faltó.
    """
    frecuencia = spec.get("frecuencia_hz") or None
    metodo = spec.get("metodo") or "completo"
    terminales = spec.get("terminales") or None
    metodos = METODOS if metodo == "completo" else (metodo,)

    try:
        elementos = leer_red(spec["netlist"])
    except RedInvalida as exc:
        return {"error": str(exc), "informe": f"No se pudo leer la red: {exc}", "resultados": {}}

    regimen = f"AC, f = {fmt(frecuencia, 'Hz')} (fasores)" if frecuencia else "DC"
    red = elementos if frecuencia else preparar_dc(elementos)
    lineas = [f"ANÁLISIS DE LA RED — régimen {regimen}", ""]
    if not frecuencia and any(e.tipo in "LC" for e in elementos):
        lineas += ["En DC los inductores son cortos y los capacitores, abiertos.", ""]
    resultados: dict = {"regimen": "ac" if frecuencia else "dc"}
    errores: list[str] = []
    referencia: Solucion | None = None
    # (a, b, Z) que dio la reducción o Thévenin: lo que ngspice debe confirmar.
    zeq: tuple[str, str, sp.Expr] | None = None

    if "nodos" in metodos or "mallas" in metodos:
        try:
            referencia = analisis_nodal(red, frecuencia)
        except RedInvalida as exc:
            errores.append(f"nodos: {exc}")

    if "nodos" in metodos and referencia is not None:
        incognitas = ", ".join(referencia.incognitas)
        lineas += ["1) MÉTODO DE NODOS (análisis nodal modificado)", f"  Incógnitas: {incognitas}"]
        lineas.append("  Ecuaciones (KCL en cada nodo; restricción por cada fuente de tensión):")
        lineas += [f"    {_ecuacion(eq)}" for eq in referencia.ecuaciones]
        lineas += _seccion_solucion(referencia)
        lineas.append("")
        resultados["nodos"] = _resumen(referencia)

    if "mallas" in metodos:
        try:
            mallas = analisis_mallas(red, frecuencia)
        except RedInvalida as exc:
            errores.append(f"mallas: {exc}")
            lineas += [f"2) MÉTODO DE MALLAS: no aplica — {exc}", ""]
        else:
            lineas += ["2) MÉTODO DE MALLAS (corrientes de malla, KVL)"]
            lineas += [f"  {nota}" for nota in mallas.notas]
            lineas.append("  Ecuaciones (KVL en cada malla; una por cada fuente de corriente):")
            lineas += [f"    {_ecuacion(eq)}" for eq in mallas.ecuaciones]
            lineas.append("  Corrientes de malla:")
            lineas += [f"    {k} = {fmt(v, 'A' if k.startswith('I') else 'V')}" for k, v in mallas.incognitas.items()]
            lineas += _seccion_solucion(mallas)
            lineas.append("")
            resultados["mallas"] = _resumen(mallas)
            if referencia is not None:
                resultados["mallas_coincide_con_nodos"] = _coinciden(referencia.tensiones, mallas.tensiones)

    if ("reduccion" in metodos or "thevenin" in metodos) and not terminales:
        errores.append("reducción/Thévenin: faltan los terminales")
        lineas += ["REDUCCIÓN / THÉVENIN: no se indicaron los dos terminales entre los que se mira la red.", ""]
    elif "reduccion" in metodos:
        a, b = terminales
        try:
            reduccion = reducir(elementos, a, b, frecuencia)
        except RedInvalida as exc:
            errores.append(f"reducción: {exc}")
            lineas += [f"3) REDUCCIÓN ENTRE {a} Y {b}: {exc}", ""]
        else:
            lineas.append(f"3) REDUCCIÓN ENTRE {a} Y {b} (fuentes independientes anuladas)")
            lineas += [f"  {k + 1}. {paso}" for k, paso in enumerate(reduccion.pasos)]
            lineas += [f"  Z_eq({a}, {b}) = {fmt(reduccion.equivalente, 'Ω')}", ""]
            resultados["reduccion"] = {"terminales": [a, b], "equivalente": _numero(reduccion.equivalente)}
            zeq = (a, b, reduccion.equivalente)

    if terminales and "thevenin" in metodos:
        a, b = terminales
        try:
            th = thevenin(elementos, a, b, frecuencia)
        except RedInvalida as exc:
            errores.append(f"thévenin: {exc}")
            lineas += [f"4) THÉVENIN / NORTON: {exc}", ""]
        else:
            lineas += [
                f"4) EQUIVALENTES VISTOS DESDE {a}-{b}",
                f"  V_th = V({a}) - V({b}) en circuito abierto = {fmt(th.vth, 'V')}",
                f"  Z_th = {fmt(th.zth, 'Ω')}"
                + (" (por reducción)" if th.reduccion else " (con fuente de prueba de 1 A)"),
                f"  I_N = V_th / Z_th = {fmt(th.norton, 'A')}" if th.norton is not None else "  I_N: Z_th = 0, el equivalente es una fuente de tensión ideal",
            ]
            if th.reduccion and abs(_complejo(th.reduccion.equivalente) - _complejo(th.zth_por_prueba)) > 1e-6 * max(1, abs(_complejo(th.zth_por_prueba))):
                lineas.append(f"  Aviso: la fuente de prueba da Z_th = {fmt(th.zth_por_prueba, 'Ω')}")
            lineas.append("")
            resultados["thevenin"] = {
                "terminales": [a, b],
                "vth": _numero(th.vth),
                "zth": _numero(th.zth),
                "in": _numero(th.norton) if th.norton is not None else None,
            }
            zeq = (a, b, th.zth)

    netlist_ngspice, tensiones_ngspice, error_ngspice = resolver_con_ngspice(red, frecuencia)
    resultados["validacion"] = {"error": error_ngspice}
    if referencia is None:
        try:
            referencia = analisis_nodal(red, frecuencia)
        except RedInvalida:
            referencia = None
    # Cada verificación que sí prueba algo suma una condición; si ninguna
    # aplica, el análisis no queda confirmado.
    pruebas: list[bool] = []
    if error_ngspice:
        lineas.append(f"VERIFICACIÓN CON NGSPICE: no se pudo simular ({error_ngspice}).")
    elif referencia is not None and tensiones_ngspice is not None:
        # Sin corriente en ninguna rama, todas las tensiones son triviales
        # (iguales a la fuente o a cero) y coincidirían con cualquier análisis.
        sin_corriente = all(abs(_complejo(i)) < 1e-12 for i in referencia.corrientes.values())
        resultados["validacion"]["sin_corriente"] = sin_corriente
        if sin_corriente:
            lineas.append(
                "VERIFICACIÓN DE TENSIONES CON NGSPICE: no concluyente — en la red tal como se "
                "transcribió no circula corriente (¿un terminal quedó al aire?), así que las "
                "tensiones de nodo no prueban nada."
            )
        else:
            coinciden = _coinciden(referencia.tensiones, tensiones_ngspice)
            resultados["validacion"]["tensiones_coinciden"] = coinciden
            pruebas.append(coinciden)
            lineas.append(
                "VERIFICACIÓN DE TENSIONES CON NGSPICE: "
                + ("las tensiones de nodo coinciden con el análisis." if coinciden else "NO coinciden; revisar la transcripción de la red.")
            )
            for n, v in tensiones_ngspice.items():
                lineas.append(f"  V({n}) ngspice = {fmt(v if v.imag else v.real, 'V')}")

    netlist_zeq = None
    if zeq is not None:
        a, b, z_analisis = zeq
        netlist_zeq, z_ngspice, error_zeq = impedancia_con_ngspice(red, a, b, frecuencia)
        lineas += [
            "",
            f"VERIFICACIÓN DE Z_eq CON NGSPICE: fuente de prueba de 1 V entre {a} y {b}, "
            "fuentes independientes anuladas, Z = 1 V / I.",
        ]
        if error_zeq or z_ngspice is None:
            lineas.append(f"  No se pudo medir: {error_zeq}.")
            resultados["validacion"]["zeq"] = {"error": error_zeq, "coincide": False}
            pruebas.append(False)
        else:
            esperado = _complejo(z_analisis)
            coincide_zeq = abs(z_ngspice - esperado) <= _TOLERANCIA_VALIDACION * max(1.0, abs(esperado))
            pruebas.append(coincide_zeq)
            resultados["validacion"]["zeq"] = {
                "terminales": [a, b],
                "ngspice": _numero(z_ngspice),
                "analisis": _numero(z_analisis),
                "coincide": coincide_zeq,
                "error": None,
            }
            lineas += [
                f"  I = {fmt(1 / z_ngspice, 'A')}  →  Z_eq ngspice = {fmt(z_ngspice, 'Ω')}",
                f"  Z_eq análisis = {fmt(z_analisis, 'Ω')}: "
                + ("coincide." if coincide_zeq else "NO coincide; revisar la reducción o la transcripción."),
            ]

    resultados["validacion"]["coincide"] = bool(pruebas) and all(pruebas)

    return {
        "error": "; ".join(errores) or None,
        "informe": "\n".join(lineas).rstrip(),
        "resultados": resultados,
        "netlist": netlist_ngspice,
        "netlist_zeq": netlist_zeq,
    }


def _numero(valor):
    c = _complejo(valor)
    return c.real if abs(c.imag) < 1e-12 * max(1.0, abs(c.real)) else {"real": c.real, "imag": c.imag}


def _resumen(s: Solucion) -> dict:
    return {
        "tensiones": {n: _numero(v) for n, v in s.tensiones.items()},
        "corrientes": {k: _numero(v) for k, v in s.corrientes.items()},
    }


def _coinciden(a: dict, b: dict) -> bool:
    comunes = (set(a) & set(b)) - {TIERRA}
    if not comunes:
        return False
    return all(
        abs(_complejo(a[n]) - _complejo(b[n])) <= _TOLERANCIA_VALIDACION * max(1.0, abs(_complejo(a[n])))
        for n in comunes
    )
