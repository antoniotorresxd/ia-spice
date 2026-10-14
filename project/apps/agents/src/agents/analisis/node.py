import os
import tempfile

from agents.analisis.informe import analizar
from agents.state import CircuitState


def analisis_node(state: CircuitState) -> dict:
    """Resuelve la red que transcribió el orquestador y deja el informe en
    `outcome`. El netlist que ngspice usó para verificar queda como artefacto,
    para poder dibujar el circuito y reabrirlo."""
    outcome = dict(state["outcome"])
    resultado = analizar(outcome)
    outcome.update(
        informe=resultado["informe"],
        resultados=resultado["resultados"],
        error=resultado["error"],
    )
    actualizacion: dict = {"outcome": outcome}
    netlist = resultado.get("netlist")
    if netlist:
        directorio = tempfile.mkdtemp(prefix="agents-analisis-")
        ruta = os.path.join(directorio, "analisis.cir")
        with open(ruta, "w") as f:
            f.write(netlist)
        actualizacion["netlists"] = {"analisis": {"path": ruta, "text": netlist}}
    return actualizacion
