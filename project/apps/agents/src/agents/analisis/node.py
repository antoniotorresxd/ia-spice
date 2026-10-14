import os
import tempfile

from agents.analisis.informe import analizar
from agents.analisis.planteamiento import analizar_planteamiento, necesita_motor
from agents.state import CircuitState


def analisis_node(state: CircuitState) -> dict:
    """Resuelve la red que transcribió el orquestador y deja el informe en
    `outcome`. El netlist que ngspice usó para verificar queda como artefacto,
    para poder dibujar el circuito y reabrirlo."""
    outcome = dict(state["outcome"])
    # Op-amps, fuentes controladas, incógnitas o escenarios van al motor
    # simbólico; una red pasiva sigue por el análisis de mallas y reducción.
    resultado = analizar_planteamiento(outcome) if necesita_motor(outcome) else analizar(outcome)
    outcome.update(
        informe=resultado["informe"],
        resultados=resultado["resultados"],
        error=resultado["error"],
    )
    if resultado.get("formato"):
        outcome["formato"] = resultado["formato"]
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
    curva = resultado.get("curva")
    if curva and "analisis" in netlists:
        # el Bode de una transferencia, para la pestaña de curva del visualizador
        actualizacion["sim_results"] = {
            "analisis": {
                "metrics": None,
                "sim_error": None,
                "curve": curva["curve"],
                "analysis_type": "ac",
                "x_unit": "Hz",
                "y_unit": "dB",
                "x_label": "Frecuencia",
                "metric_name": curva["metric_name"],
                "measured_value": None,
                "target_value": None,
            }
        }
    return actualizacion
