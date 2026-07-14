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
