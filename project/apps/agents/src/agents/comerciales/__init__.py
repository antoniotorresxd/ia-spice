"""Paso de valores teóricos a valores comerciales.

`calculo` y el lazo del curador trabajan sobre valores continuos (34.4 kΩ);
lo que se simula y se entrega es lo que se puede comprar (33 kΩ, o
33 kΩ + 1.5 kΩ en serie). La separación es deliberada: el curador sigue
ajustando la variable continua y este paso la aterriza antes de cada
simulación, así ngspice juzga el circuito que de verdad se va a armar.
"""

import math
import re
from typing import Any

from agents.comerciales.series import (
    error_relativo,
    formatear,
    mas_cercano,
    mejor_combinacion,
    minimo_no_menor,
    paso,
)

_TIPOS = (
    (re.compile(r"^R[A-Za-z0-9_]*$"), "resistencia", "serie_resistencias", "ohm"),
    (re.compile(r"^C[A-Za-z0-9_]*$"), "capacitor", "serie_capacitores", "F"),
    (re.compile(r"^L[A-Za-z0-9_]*$"), "inductor", "serie_inductores", "H"),
)

# Opción de la config que habilita combinar dos piezas, y cómo se llama la
# conexión que suma sus valores para ese tipo de componente.
_COMBINACION = {
    "resistencia": ("combinar_resistencias", "serie"),
    "capacitor": ("combinar_capacitores", "paralelo"),
    "inductor": ("combinar_inductores", "serie"),
}

_SERIES_POR_DEFECTO = {
    "serie_resistencias": "E24",
    "serie_capacitores": "E12",
    "serie_inductores": "E12",
}


def marcadores(plantilla: str) -> set[str]:
    """Nombres (normalizados) de los `{marcadores}` de una plantilla SPICE."""
    return {_normalizar(n) for n in re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", plantilla)}


def _normalizar(nombre: str) -> str:
    return nombre.lower().replace("_", "")


def clasificar(nombre: str) -> tuple[str, str, str] | None:
    """(tipo, clave de serie en la config, unidad) si el nombre es un componente.

    Se decide por la convención de nombres de los solvers y plantillas del
    catálogo: los componentes van en mayúscula inicial R/C/L (R1, RB2, Cf,
    CE); todo lo demás (VCC, Vbias, beta, freq, tstep, f_c) no es una pieza
    que se compre y pasa intacto.
    """
    for patron, tipo, clave, unidad in _TIPOS:
        if patron.match(nombre):
            return tipo, clave, unidad
    return None


def config_comerciales(cfg: dict) -> dict:
    """La sección `comerciales` de la config, con valores por omisión.

    Una config de experimento sin la sección se comporta como antes de que
    existiera este paso (deshabilitado), para no cambiar en silencio los
    resultados de corridas que ya se hicieron con ella.
    """
    seccion = cfg.get("comerciales")
    if not seccion:
        return {"habilitado": False}
    return {
        **_SERIES_POR_DEFECTO,
        "habilitado": bool(seccion.get("habilitado", True)),
        "combinar_resistencias": bool(seccion.get("combinar_resistencias", True)),
        "combinar_capacitores": bool(seccion.get("combinar_capacitores", True)),
        "combinar_inductores": bool(seccion.get("combinar_inductores", True)),
        "umbral_combinacion": float(seccion.get("umbral_combinacion", 0.01)),
        **{k: seccion[k] for k in _SERIES_POR_DEFECTO if k in seccion},
    }


def _es_comprable(nombre: str, valor: Any, dados: set[str]) -> bool:
    return (
        clasificar(nombre) is not None
        and isinstance(valor, (int, float))
        and not isinstance(valor, bool)
        and math.isfinite(valor)
        and valor > 0
        # Lo que el usuario fijó (una carga RL, un C que ya tiene en mano) es
        # dato del problema, no una decisión de diseño que redondear.
        and _normalizar(nombre) not in dados
    )


def _dados(params_usuario: dict | None) -> set[str]:
    return {_normalizar(k) for k in (params_usuario or {})}


def comercializar(
    valores: dict,
    params_usuario: dict | None,
    cfg: dict,
    minimos: frozenset[str] | set[str] = frozenset(),
    usados: set[str] | None = None,
    cantidades: dict[str, int] | None = None,
) -> tuple[dict, list[dict]]:
    """Valores listos para simular y la lista de materiales que los explica.

    `valores` es lo que calculó `calculo` (o ajustó el curador); los nombres
    que no son componentes pasan sin tocarse. `minimos` son los componentes
    cuya ecuación es una cota inferior: se redondean hacia arriba, nunca al
    más cercano. Devuelve una copia: nunca muta la entrada, que es el estado
    continuo del que depende el curador. `usados` (nombres normalizados de
    los marcadores de la plantilla) deja fuera de la lista de materiales los
    valores que el solver devuelve pero el circuito no usa; `cantidades`
    dice cuántas piezas hay de cada valor repetido.
    """
    opciones = config_comerciales(cfg)
    if not opciones["habilitado"]:
        return dict(valores), []

    dados = _dados(params_usuario)
    resultado = dict(valores)
    materiales: list[dict] = []
    for nombre, ideal in valores.items():
        if not _es_comprable(nombre, ideal, dados):
            continue
        if usados is not None and _normalizar(nombre) not in usados:
            continue
        tipo, clave_serie, unidad = clasificar(nombre)
        serie = opciones[clave_serie]

        if nombre in minimos:
            equivalente = minimo_no_menor(ideal, serie)
        else:
            equivalente = mas_cercano(ideal, serie)
        realizacion, partes = "simple", [equivalente]
        opcion_combinar, aditiva = _COMBINACION[tipo]
        if (
            nombre not in minimos
            and opciones[opcion_combinar]
            and abs(error_relativo(equivalente, ideal)) > opciones["umbral_combinacion"]
        ):
            combinada = mejor_combinacion(ideal, serie, aditiva)
            if abs(error_relativo(combinada[2], ideal)) < abs(error_relativo(equivalente, ideal)):
                realizacion, partes, equivalente = combinada

        resultado[nombre] = equivalente
        materiales.append(
            {
                "nombre": nombre,
                "tipo": tipo,
                "unidad": unidad,
                "serie": serie,
                "ideal": float(ideal),
                "valor": equivalente,
                "realizacion": realizacion,
                "partes": partes,
                "cantidad": (cantidades or {}).get(nombre, 1),
                "error_pct": round(100 * error_relativo(equivalente, ideal), 3) + 0.0,  # sin "-0.00"
            }
        )
    return resultado, materiales


def forzar_avance(
    nuevos: dict,
    anteriores: dict,
    params_usuario: dict | None,
    cfg: dict,
    minimos: frozenset[str] | set[str] = frozenset(),
) -> dict:
    """Garantiza que un ajuste del curador cambie lo que se simula.

    El curador corrige el valor continuo en proporción al error; si la
    corrección es menor que medio paso de la serie, el valor comercial no se
    mueve, ngspice vuelve a medir exactamente lo mismo y la iteración se
    desperdicia. Cuando eso pasa, el componente salta al vecino de la serie
    en la dirección que pidió el ajuste.
    """
    opciones = config_comerciales(cfg)
    if not opciones["habilitado"]:
        return nuevos

    antes, _ = comercializar(anteriores, params_usuario, cfg, minimos)
    despues, _ = comercializar(nuevos, params_usuario, cfg, minimos)
    resultado = dict(nuevos)
    dados = _dados(params_usuario)
    for nombre, nuevo in nuevos.items():
        viejo = anteriores.get(nombre)
        if (
            not _es_comprable(nombre, nuevo, dados)
            or not isinstance(viejo, (int, float))
            or nuevo == viejo
            or despues[nombre] != antes[nombre]
        ):
            continue
        _, clave_serie, _ = clasificar(nombre)
        direccion = 1 if nuevo > viejo else -1
        resultado[nombre] = paso(antes[nombre], opciones[clave_serie], direccion)
    return resultado


def comentarios_materiales(materiales: list[dict], bloque: str | None = None) -> list[str]:
    """La lista de materiales como comentarios SPICE, para que viaje dentro
    del netlist que ya se guarda como artefacto."""
    if not materiales:
        return []
    titulo = f"bloque {bloque}" if bloque else "circuito"
    lineas = [f"* Valores comerciales ({titulo}): ideal -> comercial"]
    for m in materiales:
        unidad = m["unidad"]
        partes = [formatear(p, unidad) for p in m["partes"]]
        if m["realizacion"] == "simple":
            comercial = partes[0]
        else:
            # Notación de la conexión, no de la operación: dos capacitores en
            # paralelo se suman, pero se escriben C1 || C2 igual que dos R.
            union = " + " if m["realizacion"] == "serie" else " || "
            comercial = f"{union.join(partes)} = {formatear(m['valor'], unidad)}"
        cantidad = f" (x{m['cantidad']})" if m.get("cantidad", 1) > 1 else ""
        lineas.append(
            f"*   {m['nombre']}{cantidad}: {formatear(m['ideal'], unidad)} -> {comercial}"
            f" [{m['serie']}, {m['error_pct']:+.2f}%]"
        )
    return lineas


def insertar_comentarios(netlist: str, lineas: list[str]) -> str:
    """Inserta comentarios justo después de la línea de título.

    SPICE trata la primera línea como título pase lo que pase; meter algo
    antes la desplazaría y ngspice parsearía el título como componente.
    """
    if not lineas:
        return netlist
    titulo, salto, resto = netlist.partition("\n")
    return f"{titulo}\n" + "\n".join(lineas) + (f"\n{resto}" if salto else "\n")
