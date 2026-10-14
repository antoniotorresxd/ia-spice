"""La misma red resuelta por ngspice, para contrastar con el análisis simbólico."""

import os
import tempfile

from agents.analisis.red import TIERRA, Elemento, nodos
from agents.shell.ngspice_runner import run_ngspice


def netlist_spice(elementos: list[Elemento], frecuencia: float | None, titulo: str) -> str:
    """Netlist ejecutable que escribe la tensión de cada nodo en output.txt.

    En DC un `.op`; en AC un punto de `.ac` a la frecuencia pedida, con las
    fuentes como fasores de fase cero. Cada línea de salida es
    `<nodo> <real> <imag>` para poder leerla sin depender del formato de
    wrdata.
    """
    lineas = [f"* {titulo}"]
    for e in elementos:
        if e.tipo in ("V", "I"):
            fuente = f"AC {e.valor:.12g}" if frecuencia else f"DC {e.valor:.12g}"
            lineas.append(f"{e.nombre} {e.n1} {e.n2} {fuente}")
        else:
            lineas.append(f"{e.nombre} {e.n1} {e.n2} {e.valor:.12g}")
    lineas.append(".control")
    if frecuencia:
        lineas.append(f"ac lin 1 {frecuencia:.12g} {frecuencia:.12g}")
    else:
        lineas.append("op")
    for k, n in enumerate(nodos(elementos)):
        destino = ">" if k == 0 else ">>"
        if frecuencia:
            lineas.append(f"let re_{k} = real(v({n}))")
            lineas.append(f"let im_{k} = imag(v({n}))")
            lineas.append(f"echo {n} $&re_{k} $&im_{k} {destino} output.txt")
        else:
            # En .op el vector es real: imag() no devuelve 0 en todas las
            # versiones de ngspice, así que no se le pregunta.
            lineas.append(f"let re_{k} = v({n})")
            lineas.append(f"echo {n} $&re_{k} 0 {destino} output.txt")
    lineas += [".endc", ".end", ""]
    return "\n".join(lineas)


def resolver_con_ngspice(
    elementos: list[Elemento], frecuencia: float | None, titulo: str = "Analisis de red"
) -> tuple[str, dict[str, complex] | None, str | None]:
    """(netlist, tensiones de nodo o None, error o None)."""
    texto = netlist_spice(elementos, frecuencia, titulo)
    directorio = tempfile.mkdtemp(prefix="agents-analisis-")
    ruta = os.path.join(directorio, "analisis.cir")
    with open(ruta, "w") as f:
        f.write(texto)
    salida, error = run_ngspice(ruta)
    if error is not None:
        return texto, None, error
    tensiones: dict[str, complex] = {}
    with open(salida) as f:
        for linea in f:
            partes = linea.split()
            if len(partes) >= 3:
                try:
                    tensiones[partes[0]] = complex(float(partes[1]), float(partes[2]))
                except ValueError:
                    continue
    tensiones.pop(TIERRA, None)
    return texto, tensiones, None
