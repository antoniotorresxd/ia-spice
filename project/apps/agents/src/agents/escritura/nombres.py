"""Nombres de componentes que pide el enunciado.

Las plantillas del catálogo traen sus propios nombres (`Rin`, `Cf`...). Si el
enunciado nombra los componentes ("an integrator with resistor R1 and
capacitor Cf"), el netlist entregado usa esos nombres: el usuario los va a
buscar en el esquema, en la lista de materiales y en sus propias pruebas.

El cálculo, los valores comerciales y el curador siguen trabajando con los
nombres de la plantilla; el cambio se aplica solo al texto final del netlist:
- la primera palabra de cada elemento fuera de `.subckt ... .ends`
  (dentro de un subcircuito los nombres son locales),
- las referencias `i(nombre)` del bloque `.control`,
- las líneas de comentario de valores comerciales (`*   Rin: 19.3kohm -> ...`).

Se ignora un cambio que altere la letra de tipo SPICE (R, C, L, ...), porque
cambiaría qué elemento es, y uno que choque con otro nombre que se queda.
"""

import re


def _validos(netlist: str, nombres: dict[str, str] | None) -> dict[str, str]:
    if not nombres:
        return {}
    existentes = {_primera(l).lower() for l in _elementos(netlist)}
    mapa = {}
    for viejo, nuevo in nombres.items():
        viejo, nuevo = str(viejo).strip(), str(nuevo).strip()
        if not viejo or not nuevo or viejo.lower() == nuevo.lower():
            continue
        if viejo.lower() not in existentes or viejo[0].lower() != nuevo[0].lower():
            continue
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", nuevo):
            continue
        mapa[viejo.lower()] = nuevo
    # Un nombre nuevo no puede ser el de otro elemento que no se renombra.
    quedan = existentes - set(mapa)
    return {v: n for v, n in mapa.items() if n.lower() not in quedan}


def _primera(linea: str) -> str:
    return linea.split()[0] if linea.split() else ""


def _elementos(netlist: str):
    dentro = False
    for linea in netlist.splitlines():
        s = linea.strip()
        if s.lower().startswith(".subckt"):
            dentro = True
        elif s.lower().startswith(".ends"):
            dentro = False
        elif s and not dentro and s[0] not in "*.+":
            yield s


def renombrar_componentes(netlist: str, nombres: dict[str, str] | None) -> str:
    mapa = _validos(netlist, nombres)
    if not mapa:
        return netlist
    patron_i = re.compile(r"\bi\((\w+)\)", re.IGNORECASE)
    patron_com = re.compile(r"^(\*\s+)(\w+)(\s*(?:\(x\d+\))?:)")
    salida, dentro, control = [], False, False
    for linea in netlist.splitlines():
        s = linea.strip()
        baja = s.lower()
        if baja.startswith(".subckt"):
            dentro = True
        elif baja.startswith(".ends"):
            dentro = False
        elif baja.startswith(".control"):
            control = True
        elif baja.startswith(".endc"):
            control = False
        elif s.startswith("*"):
            m = patron_com.match(linea)
            if m and m.group(2).lower() in mapa:
                linea = m.group(1) + mapa[m.group(2).lower()] + m.group(3) + linea[m.end():]
        elif control:
            linea = patron_i.sub(lambda m: f"i({mapa.get(m.group(1).lower(), m.group(1))})", linea)
        elif s and not dentro and s[0] not in ".+":
            primera = _primera(s)
            if primera.lower() in mapa:
                inicio = linea.index(primera)
                linea = linea[:inicio] + mapa[primera.lower()] + linea[inicio + len(primera):]
        salida.append(linea)
    return "\n".join(salida) + ("\n" if netlist.endswith("\n") else "")
