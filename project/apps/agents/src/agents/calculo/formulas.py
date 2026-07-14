import math

R1_DEFAULT = 1000.0
R_RC_DEFAULT = 1000.0
R_MIN = 1.0  # ohms: piso para no emitir resistencias <= 0


def voltage_divider_values(params: dict) -> dict:
    v_in, v_out = params["v_in"], params["v_out"]
    r1 = R1_DEFAULT
    if v_out >= v_in:
        # meta físicamente inalcanzable: emitir un valor válido y dejar que
        # el lazo del curador la rechace al agotar iteraciones
        return {"r1": r1, "r2": R_MIN}
    return {"r1": r1, "r2": r1 * v_out / (v_in - v_out)}


def rc_lowpass_values(params: dict) -> dict:
    r = R_RC_DEFAULT
    return {"r": r, "c": 1.0 / (2 * math.pi * r * params["f_c"])}


def led_resistor_values(params: dict) -> dict:
    r = (params["v_in"] - params["v_f"]) / params["i_led"]
    return {"r": max(r, R_MIN)}


FORMULAS = {
    "voltage_divider": voltage_divider_values,
    "rc_lowpass": rc_lowpass_values,
    "led_resistor": led_resistor_values,
}
