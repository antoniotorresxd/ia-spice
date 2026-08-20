from agents.curador.reward import Measurement, compute_reward

R_MIN = 1.0


def evaluate_block(goal: dict, sim_result: dict) -> tuple[str, float | None]:
    """Evalúa un bloque: ('ok' | 'off' | 'error', error_relativo | None)."""
    if sim_result["sim_error"] is not None:
        return "error", None
    actual = sim_result["metrics"][goal["metric"]]
    rel_err = abs(actual - goal["target"]) / abs(goal["target"])
    return ("ok" if rel_err <= goal["tolerance"] else "off"), rel_err


def _adjust_voltage_divider(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "r2": values["r2"] * 2}
    return {**values, "r2": max(values["r2"] * target / actual, R_MIN)}


def _adjust_rc_lowpass(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "c": values["c"] / 2}
    return {**values, "c": values["c"] * actual / target}


def _adjust_led_resistor(values: dict, target: float, actual: float) -> dict:
    if actual <= 0:
        return {**values, "r": max(values["r"] / 2, R_MIN)}
    return {**values, "r": max(values["r"] * actual / target, R_MIN)}


# regla proporcional sobre el componente dominante, por tipo de circuito
ADJUST_RULES = {
    "voltage_divider": _adjust_voltage_divider,
    "rc_lowpass": _adjust_rc_lowpass,
    "led_resistor": _adjust_led_resistor,
}


def perturb(values: dict) -> dict:
    """Reintento tras sim_error: perturbación simple de todos los valores."""
    return {k: v * 1.05 for k, v in values.items()}


def observed_reduction(history: list) -> float | None:
    """ρ estimado del historial: cuánto redujo el error el último ajuste.

    Devuelve None mientras no haya dos iteraciones que comparar. Se acota a 1.0
    porque un ajuste que empeoró el error no puede prometer mejorarlo.

    Ojo con ρ = 1.0: ahí `R_adjust - R_accept` colapsa a -γ, negativo sea cual
    sea el error, así que aceptar gana siempre. Es correcto como señal de
    "seguir ajustando ya no paga", pero por sí solo dejaría pasar como aceptado
    un circuito malísimo que se estancó. Quien decide aplica además el tope de
    `max_acceptable_ape` (ver `choose_action`).
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

    `accept_admissible` es la barandilla: la recompensa dice *cuándo parar*,
    no *si el circuito sirve*. Con ρ saturado en 1.0 aceptar gana siempre, así
    que sin este tope un circuito que se estancó lejísimos de la meta se
    reportaría como aceptado e inflaría la tasa de circuitos que la cumplen.
    Quien llama lo calcula comparando el error ponderado contra
    `max_acceptable_ape`. Cuando no es admisible se sigue ajustando, y si ya no
    quedan iteraciones el desenlace es rechazar, que es lo honesto.
    """
    if not adjust_available:
        return "reject"
    if not accept_admissible:
        return "adjust"
    return "accept" if action_rewards["accept"] >= action_rewards["adjust"] else "adjust"
