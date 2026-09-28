from agents.config import get_config
from agents.curador.reward import Measurement, compute_reward


def metric_key(requirement: dict) -> str:
    """La clave con la que este requisito se busca en `sim_result['metrics']`.

    Sin `node` (el caso de Slice A, un bloque = un requisito = una métrica),
    la clave es el nombre de la medida tal cual, igual que siempre. Con
    `node` (composición de Slice B), dos requisitos con la misma `measure`
    en nodos distintos del circuito compuesto colisionarían en una sola
    clave si no se distinguen — de ahí el sufijo `__at__node`. Esta clave
    también se usa tal cual como nombre de variable dentro de ngspice
    (`.meas`/`$&`), que acepta letras, dígitos y `_`, pero no `@`.
    """
    node = requirement.get("node")
    measure = requirement["measure"]
    return f"{measure}__at__{node}" if node else measure


def evaluate_requirement(requirement: dict, sim_result: dict) -> tuple[str, float | None]:
    """Evalúa un requisito: ('ok' | 'off' | 'error', error_relativo | None)."""
    metrics = sim_result.get("metrics") or {}
    measure = requirement["measure"]
    key = metric_key(requirement)
    if sim_result["sim_error"] is not None or key not in metrics:
        return "error", None
    actual = metrics[key]
    target = requirement["value"]
    comparator = requirement.get("comparator", "approx")
    if comparator == "approx":
        # Compatibilidad no negociable: el código anterior usa 1.0 cerca de
        # cero, no 1e-12. Cambiarlo alteraría APE, reward y decisiones.
        denom = abs(target) if abs(target) > 1e-12 else 1.0
        metric_name = measure.lower()
        if "gain" in metric_name or metric_name in ("av", "a_v"):
            rel_err = abs(abs(actual) - abs(target)) / denom
        else:
            rel_err = abs(actual - target) / denom
    elif comparator == "le":
        rel_err = max(actual - target, 0.0) / max(abs(target), 1e-12)
    elif comparator == "ge":
        rel_err = max(target - actual, 0.0) / max(abs(target), 1e-12)
    else:
        raise ValueError(f"unknown comparator: {comparator}")
    return ("ok" if rel_err <= requirement["tolerance"] else "off"), rel_err


def _adjust_catalog(values: dict, target: float, actual: float) -> dict:
    """Ajuste paramétrico para circuitos del catálogo."""
    if abs(actual) < 1e-9:
        return perturb(values)
    ratio = abs(target) / abs(actual)
    new_values = dict(values)
    if "RZ" in new_values:
        new_values["RZ"] = max(new_values["RZ"] / ratio, 1.0)
    elif "R" in new_values and ("C" in new_values or "C1" in new_values):
        # fc (o fo, Sallen-Key) ∝ 1/(R·C): inversa, de ahí /ratio. Sallen-Key
        # devuelve C1/C2, no "C" a secas — sin el `or "C1"` caía en el
        # fallback genérico de abajo, que escala R con `* ratio` (la
        # dirección correcta para una relación DIRECTA, no esta). Confirmado
        # en ngspice: con esa rama, pedir bajar fo de hecho la subía.
        new_values["R"] = max(new_values["R"] / ratio, 1.0)
    elif "R2" in new_values:
        new_values["R2"] = max(new_values["R2"] * ratio, 1.0)
    elif "Rf" in new_values:
        new_values["Rf"] = max(new_values["Rf"] * ratio, 1.0)
    elif "RC" in new_values:
        # VCEQ (la métrica de los dos tipos BJT que traen RC) baja al SUBIR
        # RC —más caída en el colector—, al revés que R2/Rf (donde más
        # resistencia sube la salida). Multiplicar por `ratio` como esos dos
        # empuja en la dirección que empeora el error: si actual > target
        # (VCEQ de más), ratio < 1 encoge RC, lo que sube VCEQ todavía más.
        new_values["RC"] = max(new_values["RC"] / ratio, 1.0)
    elif "Vbias" in new_values or "V1" in new_values:
        # vclip ≈ Vbias + 0.7 V (la caída del diodo): una relación ADITIVA,
        # no proporcional — nada que ver con escalar una resistencia. Sin
        # esta rama, el fallback genérico de abajo agarraba "R" (el primer
        # nombre que empieza con R) y lo escalaba: confirmado en ngspice que
        # un rango de 100x en R apenas mueve vclip ~0.2 V, así que ese
        # ajuste no converge nunca si el punto de partida queda lejos.
        key = "Vbias" if "Vbias" in new_values else "V1"
        new_values[key] = round(new_values[key] + (target - actual), 4)
    else:
        for k in list(new_values.keys()):
            if k.upper().startswith("R") and isinstance(new_values[k], (int, float)):
                new_values[k] = max(new_values[k] * ratio, 1.0)
                break
    return new_values


ADJUST_RULES = {
    "catalog": _adjust_catalog,
}


def perturb(values: dict) -> dict:
    """Reintento tras sim_error: perturbación simple de todos los valores."""
    factor = get_config()["calculo"]["perturb_factor"]
    return {k: v * factor for k, v in values.items()}


def observed_reduction(history: list) -> float | None:
    """ρ estimado del historial: cuánto redujo el error el último ajuste.

    Devuelve None mientras no haya dos iteraciones que comparar. Se acota a 1.0
    porque un ajuste que empeoró el error no puede prometer mejorarlo.

    Ojo con ρ = 1.0: ahí `R_adjust - R_accept` colapsa a -γ, negativo sea cual
    sea el error, así que aceptar gana siempre. Es correcto como señal de
    "seguir ajustando ya no paga", pero por sí solo dejaría pasar como aceptado
    un circuito malísimo que se estancó. Quien decide aplica además
    `accept_is_admissible`, que compara contra la tolerancia de cada requisito.
    """
    scored = [r["weighted_ape"] for r in history if r.get("weighted_ape") is not None]
    # weighted_ape suma términos no negativos, así que <= 0 solo ocurre cuando
    # la iteración anterior fue perfecta: el guard evita dividir entre cero.
    if len(scored) < 2 or scored[-2] <= 0:
        return None
    return min(scored[-1] / scored[-2], 1.0)


def estimate_action_rewards(
    measurements: list[Measurement],
    converged: bool,
    iteration: int,
    config: dict,
    reduction: float | None = None,
) -> dict[str, float]:
    """Recompensa estimada de cada acción disponible desde el estado actual.

    `adjust` se proyecta multiplicando los APE por ρ y pagando una iteración
    más de castigo: es lo que valdría el circuito si el ajuste rindiera lo
    esperado.

    Si se pasa `reduction`, tiene precedencia sobre el
    `expected_error_reduction` de la configuración; ese default solo se usa
    mientras el historial no da para estimar ρ.
    """
    rho = (
        reduction
        if reduction is not None
        else config["curador"]["expected_error_reduction"]
    )
    projected = [(metric, ape * rho) for metric, ape in measurements]

    return {
        "accept": compute_reward(measurements, converged, iteration, config),
        "adjust": compute_reward(projected, converged, iteration + 1, config),
        "reject": config["curador"]["reject_reward"],
    }


def accept_is_admissible(
    requirements: list[tuple[str, int, float]],
    evaluations: dict[tuple[str, int], tuple[str, float | None]],
    config: dict,
) -> bool:
    """Si el circuito que hay ahora se puede entregar.

    La recompensa dice *cuándo parar de iterar*; esto dice *si lo que hay
    sirve*. Son preguntas distintas y hay que separarlas: con ρ saturado en
    1.0 aceptar gana siempre por -γ, sin importar el error, así que sin este
    freno un circuito estancado lejísimos de la meta se reportaría como
    aceptado e inflaría la tasa de circuitos que cumplen su meta.

    El desvío se mide en unidades de la tolerancia que el propio objetivo
    declaró, no en puntos de APE. Un tope global en APE trataría igual a un
    bloque con tolerancia del 1 % y a uno del 5 %, y aceptaría el primero
    incumpliendo su meta por seis veces.

    Un requisito que no llegó a medirse nunca es admisible: no hay nada que
    entregar.
    """
    slack = config["curador"]["accept_tolerance_slack"]
    for block_id, req_index, tolerance in requirements:
        status, rel_err = evaluations[(block_id, req_index)]
        if status == "error" or rel_err is None:
            return False
        if rel_err > slack * tolerance:
            return False
    return True


def choose_action(
    action_rewards: dict[str, float],
    adjust_available: bool,
    accept_admissible: bool = True,
) -> str:
    """Elige entre aceptar y ajustar por recompensa.

    Rechazar no compite: es el desenlace cuando ya no quedan iteraciones. Que
    fuera una opción más obligaría a calibrar su recompensa entre dos
    condiciones incompatibles — reintentar tras un error de simulación tiene
    que ganarle a rechazar, y rechazar tiene que ganarle a entregar un circuito
    muy desviado — y no hay ningún valor que cumpla las dos.

    `accept_admissible` es la barandilla, y quien llama la calcula con
    `accept_is_admissible`. Cuando el circuito no es entregable se sigue
    ajustando aunque la recompensa prefiera aceptar, y si ya no quedan
    iteraciones el desenlace es rechazar, que es lo honesto.
    """
    if not adjust_available:
        return "reject"
    if not accept_admissible:
        return "adjust"
    return "accept" if action_rewards["accept"] >= action_rewards["adjust"] else "adjust"
