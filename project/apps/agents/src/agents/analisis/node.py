import os
import tempfile

import json

from agents.analisis.informe import analizar
from agents.analisis.planteamiento import analizar_planteamiento, necesita_motor
from agents.state import CircuitState


# Un reintento: lo que no arregla una corrección con el error a la vista no
# lo arregla repetirla, y cada vuelta cuesta una llamada al LLM.
MAX_CORRECCIONES = 1

_CAMPOS_PLANTEAMIENTO = (
    "mode", "netlist", "metodo", "terminales", "frecuencia_hz", "incognitas", "escenarios", "preguntas",
)


def _problema_corregible(resultado: dict, motor: bool) -> str | None:
    """¿Lo que falló puede ser una transcripción mal hecha? Un error del
    planteamiento (sistema singular, mediciones incompatibles, una
    expresión que no existe) o, en el motor simbólico, que ngspice no
    reproduzca lo calculado."""
    if resultado.get("error"):
        return resultado["error"]
    planteamiento = (resultado.get("resultados") or {}).get("planteamiento", {})
    # Lo que el enunciado pide y el planteamiento no incluye: resolverlo
    # "bien" sería resolver otro problema.
    faltan = planteamiento.get("faltantes") or []
    if motor and faltan:
        return "el planteamiento no incluye todo lo que pide el enunciado: " + "; ".join(faltan)
    # Solo lo que ngspice contradijo: una respuesta en letras no se simula,
    # pero no está mal y no hay nada que corregir.
    fallas = planteamiento.get("fallas") or []
    if motor and fallas:
        return "ngspice no reproduce lo calculado con los valores encontrados: " + "; ".join(fallas)
    return None


def route_after_analisis(state: CircuitState) -> str:
    return "corregir" if state.get("correccion_analisis") else "fin"


def analisis_node(state: CircuitState) -> dict:
    """Resuelve la red que transcribió el orquestador y deja el informe en
    `outcome`. El netlist que ngspice usó para verificar queda como artefacto,
    para poder dibujar el circuito y reabrirlo."""
    outcome = dict(state["outcome"])
    # Op-amps, fuentes controladas, incógnitas o escenarios van al motor
    # simbólico; una red pasiva sigue por el análisis de mallas y reducción.
    motor = necesita_motor(outcome)
    resultado = analizar_planteamiento(outcome) if motor else analizar(outcome)
    hechas = list(state.get("correcciones_hechas") or [])
    if hechas:
        # Este es el reintento: el informe cuenta qué se corrigió y por qué.
        resultado["informe"] = (
            f"> El primer planteamiento no se pudo usar ({hechas[-1]}); el orquestador "
            "corrigió la transcripción y este es el resultado del segundo intento.\n\n"
            + resultado["informe"]
        )
    outcome.update(
        informe=resultado["informe"],
        resultados=resultado["resultados"],
        error=resultado["error"],
    )
    if resultado.get("formato"):
        outcome["formato"] = resultado["formato"]
    actualizacion: dict = {"outcome": outcome}
    problema = _problema_corregible(resultado, motor)
    if problema and state.get("request_text") and len(hechas) < MAX_CORRECCIONES:
        # Vuelve una vez al orquestador con su respuesta y el error exacto.
        anterior = {k: v for k, v in state["outcome"].items() if k in _CAMPOS_PLANTEAMIENTO}
        actualizacion["correccion_analisis"] = {
            "anterior": json.dumps(anterior, ensure_ascii=False),
            "error": problema,
        }
        actualizacion["correcciones_hechas"] = hechas + [problema]
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
        # el Bode de una transferencia o el barrido de un parámetro (con los
        # puntos que simuló ngspice), para la pestaña de curva del visualizador
        actualizacion["sim_results"] = {
            "analisis": {
                "metrics": None,
                "sim_error": None,
                "curve": curva["curve"],
                "markers": curva.get("markers"),
                "analysis_type": curva["analysis_type"],
                "x_unit": curva["x_unit"],
                "y_unit": curva["y_unit"],
                "x_label": curva["x_label"],
                "metric_name": curva["metric_name"],
                "measured_value": None,
                "target_value": None,
            }
        }
    return actualizacion
