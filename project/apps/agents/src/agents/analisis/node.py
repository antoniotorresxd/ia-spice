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
    # `analisis` es la red tal cual (tensiones de nodo); `analisis_zeq`, la de
    # la fuente de prueba entre los terminales, cuando se pidió una Z_eq.
    netlists = {}
    for clave, texto in (("analisis", resultado.get("netlist")), ("analisis_zeq", resultado.get("netlist_zeq"))):
        if texto:
            directorio = tempfile.mkdtemp(prefix="agents-analisis-")
            ruta = os.path.join(directorio, f"{clave}.cir")
            with open(ruta, "w") as f:
                f.write(texto)
            netlists[clave] = {"path": ruta, "text": texto}
    if netlists:
        actualizacion["netlists"] = netlists
    return actualizacion
