"""Semiconductores reales para la lista de materiales.

Las resistencias, capacitores e inductores se aterrizan a una serie E; los
semiconductores se aterrizan a un número de parte. Tres casos:

- Zéner: la tensión pedida se lleva al 1N47xxA más cercano (sus tensiones
  nominales son exactamente la serie E24 entre 3.3 y 33 V), y se simula con
  esa tensión.
- BJT: si el usuario no dio un beta propio, el `.model` genérico se reemplaza
  por el modelo real (2N3904 / 2N3906). El solver diseña con beta = 100, que
  es el hFE mínimo de hoja de datos del 2N3904: diseñar con el mínimo y
  simular con el típico es justo lo que hace quien diseña.
- Diodos de señal y op-amps: se listan con su número de parte; el op-amp se
  sigue simulando con el macromodelo ideal de la plantilla (un modelo real
  exige pines de alimentación que las plantillas no tienen) y la lista lo dice.
"""

import math
import re

# (tensión nominal, número de parte); serie 1N4728A–1N4752A, 1 W.
ZENERS_1N47XX: tuple[tuple[float, str], ...] = (
    (3.3, "1N4728A"), (3.6, "1N4729A"), (3.9, "1N4730A"), (4.3, "1N4731A"),
    (4.7, "1N4732A"), (5.1, "1N4733A"), (5.6, "1N4734A"), (6.2, "1N4735A"),
    (6.8, "1N4736A"), (7.5, "1N4737A"), (8.2, "1N4738A"), (9.1, "1N4739A"),
    (10.0, "1N4740A"), (11.0, "1N4741A"), (12.0, "1N4742A"), (13.0, "1N4743A"),
    (15.0, "1N4744A"), (16.0, "1N4745A"), (18.0, "1N4746A"), (20.0, "1N4747A"),
    (22.0, "1N4748A"), (24.0, "1N4749A"), (27.0, "1N4750A"), (30.0, "1N4751A"),
    (33.0, "1N4752A"),
)

# Modelos de hoja de datos (Fairchild/ON Semiconductor), los que traen las
# bibliotecas estándar de SPICE.
MODELOS_BJT = {
    "NPN": (
        "2N3904",
        "NPN(IS=6.734f XTI=3 EG=1.11 VAF=74.03 BF=416.4 NE=1.259 ISE=6.734f "
        "IKF=66.78m XTB=1.5 BR=.7371 NC=2 ISC=0 IKR=0 RC=1 CJC=3.638p MJC=.3085 "
        "VJC=.75 FC=.5 CJE=4.493p MJE=.2593 VJE=.75 TR=239.5n TF=301.2p ITF=.4 "
        "VTF=4 XTF=2 RB=10)",
    ),
    "PNP": (
        "2N3906",
        "PNP(IS=1.41f XTI=3 EG=1.11 VAF=18.7 BF=180.7 NE=1.5 ISE=0 IKF=80m "
        "XTB=1.5 BR=4.977 NC=2 ISC=0 IKR=0 RC=2.5 CJC=9.728p MJC=.5776 VJC=.75 "
        "FC=.5 CJE=8.063p MJE=.3677 VJE=.75 TR=33.42n TF=179.3p ITF=.4 VTF=4 "
        "XTF=6 RB=10)",
    ),
}

def _encapsulado(opamps: int) -> tuple[str, int]:
    """Simple, doble o cuádruple: el que cubre todos con menos integrados."""
    if opamps == 1:
        return "TL081", 1
    if opamps == 2:
        return "TL082", 1
    return "TL084", math.ceil(opamps / 4)


def aterrizar_zener(valores: dict) -> tuple[dict, float | None]:
    """Lleva VZ al 1N47xxA más cercano. Devuelve (valores, VZ pedido o None)."""
    vz = valores.get("VZ")
    if not isinstance(vz, (int, float)):
        return valores, None
    zener = zener_comercial(float(vz))
    if zener is None or zener[0] == vz:
        return valores, None
    return {**valores, "VZ": zener[0]}, float(vz)


def zener_comercial(vz: float) -> tuple[float, str] | None:
    """El 1N47xxA de tensión más cercana, o None fuera de 3.3–33 V."""
    if not 3.0 <= vz <= 36.0:
        return None
    return min(ZENERS_1N47XX, key=lambda par: abs(math.log(par[0] / vz)))


def _lineas(netlist: str) -> list[str]:
    """Líneas de elementos y tarjetas fuera de `.subckt` y de `.control`."""
    resultado, dentro = [], None
    for cruda in netlist.splitlines():
        linea = cruda.strip()
        baja = linea.lower()
        if baja.startswith((".subckt", ".control")):
            dentro = baja.split()[0]
            continue
        if (dentro == ".subckt" and baja.startswith(".ends")) or (
            dentro == ".control" and baja.startswith(".endc")
        ):
            dentro = None
            continue
        if dentro is None and linea and not linea.startswith("*"):
            resultado.append(linea)
    return resultado


def _modelos(lineas: list[str]) -> dict[str, tuple[str, str]]:
    """nombre de modelo (en minúscula) -> (tipo, parámetros)."""
    modelos = {}
    for linea in lineas:
        m = re.match(r"\.model\s+(\S+)\s+(\w+)\s*\(?(.*?)\)?\s*$", linea, re.IGNORECASE)
        if m:
            modelos[m.group(1).lower()] = (m.group(2).upper(), m.group(3))
    return modelos


def identificar_semiconductores(netlist: str) -> list[dict]:
    """Semiconductores y op-amps del netlist, con la pieza sugerida.

    Se lee del netlist ya armado (no de la topología), así que sirve igual
    para un bloque genérico escrito por el LLM.
    """
    lineas = _lineas(netlist)
    modelos = _modelos(lineas)
    agrupados: dict[tuple[str, str], dict] = {}

    def _agregar(tipo: str, pieza: str, referencia: str, nota: str, modelo_real: bool) -> None:
        entrada = agrupados.setdefault(
            (tipo, pieza),
            {"tipo": tipo, "pieza": pieza, "referencias": [], "nota": nota, "modelo_real": modelo_real},
        )
        entrada["referencias"].append(referencia)

    opamps = []
    for linea in lineas:
        tokens = linea.split()
        referencia = tokens[0]
        letra = referencia[0].upper()
        if letra == "D" and len(tokens) >= 4:
            tipo_modelo, parametros = modelos.get(tokens[3].lower(), ("D", ""))
            bv = re.search(r"\bBV\s*=\s*([0-9.eE+-]+)", parametros, re.IGNORECASE)
            if bv:
                zener = zener_comercial(float(bv.group(1)))
                if zener:
                    _agregar("zener", zener[1], referencia, f"Zéner {zener[0]:g} V, 1 W", True)
                else:
                    _agregar("zener", f"Zéner {float(bv.group(1)):g} V", referencia, "fuera de la serie 1N47xx", False)
            else:
                _agregar("diodo", "1N4148", referencia, "diodo de conmutación de señal", "1n4148" in tokens[3].lower())
        elif letra == "Q" and len(tokens) >= 5:
            tipo_modelo, _ = modelos.get(tokens[4].lower(), ("NPN", ""))
            pieza, _ = MODELOS_BJT.get(tipo_modelo, MODELOS_BJT["NPN"])
            _agregar(
                "transistor",
                pieza,
                referencia,
                f"BJT {tipo_modelo} de propósito general",
                tokens[4].upper() == pieza,
            )
        elif letra == "X" and tokens[-1].lower() == "opamp":
            opamps.append(referencia)

    piezas = [
        {**entrada, "cantidad": len(entrada["referencias"])} for entrada in agrupados.values()
    ]
    if opamps:
        pieza, cantidad = _encapsulado(len(opamps))
        piezas.append(
            {
                "tipo": "op-amp",
                "pieza": pieza,
                "referencias": opamps,
                "cantidad": cantidad,
                "nota": (
                    f"{len(opamps)} op-amp(s) en {cantidad} x {pieza} (JFET, ±15 V); "
                    "simulado con macromodelo ideal (ganancia 1e5, un polo)"
                ),
                "modelo_real": False,
            }
        )
    for p in piezas:
        p["nombre"] = ", ".join(p["referencias"])
    return piezas


def usar_modelos_reales(netlist: str) -> str:
    """Reemplaza los `.model` genéricos de BJT por el modelo de la pieza real.

    Cambia la tarjeta y las referencias de los transistores que la usan, así
    que el netlist sigue siendo autocontenido.
    """
    lineas = netlist.splitlines()
    modelos = _modelos(_lineas(netlist))
    renombres: dict[str, str] = {}
    tarjetas: dict[str, str] = {}
    for nombre, (tipo, _) in modelos.items():
        if tipo in MODELOS_BJT:
            pieza, tarjeta = MODELOS_BJT[tipo]
            renombres[nombre] = pieza
            tarjetas[nombre] = f".model {pieza} {tarjeta}"
    if not renombres:
        return netlist

    salida = []
    for linea in lineas:
        tokens = linea.split()
        if tokens and tokens[0].lower() == ".model" and len(tokens) > 1 and tokens[1].lower() in tarjetas:
            salida.append(tarjetas[tokens[1].lower()])
        elif tokens and tokens[0][0].upper() == "Q" and len(tokens) >= 5 and tokens[4].lower() in renombres:
            tokens[4] = renombres[tokens[4].lower()]
            salida.append(" ".join(tokens))
        else:
            salida.append(linea)
    return "\n".join(salida) + ("\n" if netlist.endswith("\n") else "")


def comentarios_piezas(piezas: list[dict]) -> list[str]:
    if not piezas:
        return []
    lineas = ["* Semiconductores:"]
    for p in piezas:
        simulado = "modelo real" if p["modelo_real"] else "modelo genérico"
        lineas.append(
            f"*   {', '.join(p['referencias'])}: {p['cantidad']} x {p['pieza']} ({p['nota']}; {simulado})"
        )
    return lineas
