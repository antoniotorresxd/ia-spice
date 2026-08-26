import math

from agents.config import get_config


def _calculo_cfg() -> dict:
    # Se lee por llamada, no al importar: si se leyera al importar, cambiar la
    # configuración exigiría reimportar el módulo y las pruebas no podrían
    # sustituirla.
    return get_config()["calculo"]


def voltage_divider_values(params: dict) -> dict:
    cfg = _calculo_cfg()
    v_in, v_out = params["v_in"], params["v_out"]
    r1 = cfg["r1_default"]
    if v_out >= v_in:
        # meta físicamente inalcanzable: emitir un valor válido y dejar que
        # el lazo del curador la rechace al agotar iteraciones
        return {"r1": r1, "r2": cfg["r_min"]}
    return {"r1": r1, "r2": r1 * v_out / (v_in - v_out)}


def rc_lowpass_values(params: dict) -> dict:
    r = _calculo_cfg()["r_rc_default"]
    return {"r": r, "c": 1.0 / (2 * math.pi * r * params["f_c"])}


def led_resistor_values(params: dict) -> dict:
    r = (params["v_in"] - params["v_f"]) / params["i_led"]
    return {"r": max(r, _calculo_cfg()["r_min"])}


def noninverting_amp_values(params: dict) -> dict:
    cfg = _calculo_cfg()
    rg = cfg["rg_default"]
    gain = params["v_out"] / params["v_in"]
    if gain <= 1.0:
        # un no inversor no puede atenuar: meta físicamente inalcanzable.
        # Se emite un circuito válido (ganancia ~1) y el lazo del curador la
        # rechaza al agotar iteraciones, como hace el divisor.
        return {"rg": rg, "rf": cfg["r_min"]}
    return {"rg": rg, "rf": rg * (gain - 1.0)}


FORMULAS = {
    "voltage_divider": voltage_divider_values,
    "rc_lowpass": rc_lowpass_values,
    "led_resistor": led_resistor_values,
    "noninverting_amp": noninverting_amp_values,
}
