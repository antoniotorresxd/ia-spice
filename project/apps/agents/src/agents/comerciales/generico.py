"""Valores comerciales en un bloque `generic`, cuyo netlist escribió el LLM.

Un bloque del catálogo trae sus valores sueltos (lo que calculó el solver);
uno genérico solo trae el netlist, así que aquí se leen sus R/C/L, se
aterrizan con el mismo `comercializar` (la serie del enunciado, o E24) y se
reescriben las líneas. Qué valores elegir para que las razones sigan dando
lo pedido lo decide el LLM al escribir el netlist (se le pide la serie); si
el redondeo saca al circuito de tolerancia, ngspice lo detecta y el curador
pide una reparación.
"""

import math
import re

from agents.comerciales import comercializar, config_comerciales

_SUFIJOS = {"t": 1e12, "g": 1e9, "meg": 1e6, "k": 1e3, "m": 1e-3, "u": 1e-6, "µ": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15}
_NUMERO = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|[tgkmuµnpf])?[a-zω]*$", re.IGNORECASE)


def _valor_spice(texto: str) -> float | None:
    m = _NUMERO.match(texto.strip())
    if not m:
        return None
    return float(m.group(1)) * _SUFIJOS.get((m.group(2) or "").lower(), 1.0)


def componentes(netlist: str) -> dict[str, tuple[int, float]]:
    """{nombre: (índice de línea, valor)} de las R/C/L del nivel superior
    con valor numérico. Lo de dentro de `.subckt` (el macromodelo del
    op-amp) y de `.control` no es una pieza que se compre."""
    encontrados: dict[str, tuple[int, float]] = {}
    fin_de_bloque = None
    for i, linea in enumerate(netlist.splitlines()):
        texto = linea.strip()
        baja = texto.lower()
        if i == 0 or not texto or texto.startswith(("*", "+")):
            continue
        if fin_de_bloque:
            if baja.startswith(fin_de_bloque):
                fin_de_bloque = None
            continue
        if baja.startswith(".subckt"):
            fin_de_bloque = ".ends"
            continue
        if baja.startswith(".control"):
            fin_de_bloque = ".endc"
            continue
        tokens = texto.split()
        if texto.startswith(".") or len(tokens) < 4 or tokens[0][0].upper() not in "RCL":
            continue
        valor = _valor_spice(tokens[3])
        if valor is not None and valor > 0 and math.isfinite(valor):
            encontrados[tokens[0]] = (i, valor)
    return encontrados


def _formato(valor: float) -> str:
    for sufijo, escala in (("meg", 1e6), ("k", 1e3), ("", 1.0), ("m", 1e-3), ("u", 1e-6), ("n", 1e-9), ("p", 1e-12)):
        if abs(valor) >= escala * 0.999999:
            return f"{valor / escala:.6g}{sufijo}"
    return f"{valor:.6g}"


def comercializar_generico(netlist: str, cfg: dict, nivel: int = 0) -> tuple[str, list[dict]]:
    """(netlist con valores comerciales, lista de materiales)."""
    if not config_comerciales(cfg, nivel)["habilitado"]:
        return netlist, []
    piezas = componentes(netlist)
    if not piezas:
        return netlist, []
    valores = {nombre: valor for nombre, (_, valor) in piezas.items()}
    comerciales, materiales = comercializar(valores, None, cfg, nivel=nivel)
    lineas = netlist.splitlines()
    for nombre, (i, _) in piezas.items():
        tokens = lineas[i].split()
        tokens[3] = _formato(comerciales[nombre])
        lineas[i] = " ".join(tokens)
    return "\n".join(lineas) + ("\n" if netlist.endswith("\n") else ""), materiales
