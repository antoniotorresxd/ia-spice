import math
from typing import Any

from agents.knowledge.circuit_client import fetch_circuit_detail


def _param(params: dict[str, Any], *keys: str, default: float | None = None) -> float:
    """Busca un parámetro por varias variantes de nombre (e.g. v_z, vz, VZ)."""
    normalized = {k.lower().replace("_", ""): v for k, v in params.items()}
    for key in keys:
        norm_key = key.lower().replace("_", "")
        if norm_key in normalized:
            return float(normalized[norm_key])
        if key in params:
            return float(params[key])
    if default is not None:
        return float(default)
    raise ValueError(f"Falta el parámetro requerido: uno de {keys} en {params}")


def solve_zener_regulator(params: dict[str, Any]) -> dict[str, float]:
    """Resuelve componentes para la fuente regulada lineal con Zener.

    Ecuaciones de diseño del catálogo:
    1. Vm = sqrt(2) * V_sec_rms - 1.4 (caída rectificador puente)
    2. C >= IL,max / (2 * f_line * V_ripple)
    3. Vin,min = Vm - V_ripple
    4. RZ = (Vin,min - VZ) / (IZ,min + IL,max)
    5. RL = VZ / IL,max
    """
    vz = _param(params, "v_z", "vz", "v_out", "target")
    il_max = _param(params, "i_l_max", "il_max", "il")
    v_sec_rms = _param(params, "v_sec_rms", "vsec_rms", "v_sec", default=12.0)
    v_ripple = _param(params, "v_ripple", "vripple", default=1.5)
    f_line = _param(params, "f_line", "fline", default=60.0)
    iz_min = _param(params, "i_z_min", "iz_min", default=0.005)

    vm = round(math.sqrt(2) * v_sec_rms - 1.4, 2)
    vin_min = round(vm - v_ripple, 2)
    if vin_min <= vz:
        vin_min = vz + 2.0  # margen mínimo para regulación física

    rz = (vin_min - vz) / (iz_min + il_max)
    rl = vz / il_max if il_max > 0 else 1e6
    c = il_max / (2 * f_line * v_ripple) if (f_line > 0 and v_ripple > 0) else 1e-4

    return {
        "Vin_min": round(vin_min, 2),
        "RZ": round(rz, 2),
        "RL": round(rl, 2),
        "VZ": round(vz, 2),
        "C": round(c, 6),
        "Vm": round(vm, 2),
    }


def solve_rc_lowpass_passive(params: dict[str, Any]) -> dict[str, float]:
    fc = _param(params, "f_c", "fc", "target")
    c = _param(params, "c", default=1e-8)
    r = 1.0 / (2 * math.pi * fc * c)
    return {"R": round(r, 2), "C": c, "f_c": fc}


def solve_bjt_voltage_divider(params: dict[str, Any]) -> dict[str, float]:
    vcc = _param(params, "v_cc", "vcc", default=12.0)
    icq = _param(params, "i_cq", "icq", default=0.002)
    vceq = _param(params, "v_ceq", "vceq", "target", default=vcc / 2.0)
    beta = _param(params, "beta", default=100.0)

    re = (vcc - vceq) / (4 * icq) if icq > 0 else 100.0
    rc = 3 * re
    r_th = 0.1 * beta * re
    vbe = 0.7
    v_th = vbe + icq * re * (1 + 0.1 / beta)
    if v_th >= vcc:
        v_th = vcc * 0.5
    rb1 = r_th * vcc / (vcc - v_th)
    rb2 = r_th * vcc / v_th

    return {
        "VCC": vcc,
        "RB1": round(rb1, 2),
        "RB2": round(rb2, 2),
        "RC": round(rc, 2),
        "RE": round(re, 2),
        "beta": beta,
    }


def solve_diode_clamper(params: dict[str, Any]) -> dict[str, float]:
    vm = _param(params, "v_m", "vm", default=10.0)
    f = _param(params, "f", default=1000.0)
    v_bias = _param(params, "v_bias", "vbias", default=0.0)
    rl = _param(params, "r_l", "rl", default=100000.0)
    c = 10.0 / (2 * math.pi * f * rl)
    return {"Vm": vm, "f": f, "C": c, "Vbias": v_bias, "RL": rl}


def solve_diode_clipper(params: dict[str, Any]) -> dict[str, float]:
    vm = _param(params, "v_m", "vm", default=10.0)
    v_clip = _param(params, "v_clip", "vclip", "target", default=5.0)
    f = _param(params, "f", default=1000.0)
    rl = _param(params, "r_l", "rl", default=100000.0)
    v1 = v_clip - 0.7
    r = 1000.0
    return {"Vm": vm, "f": f, "R": r, "V1": round(v1, 2), "RL": rl}


def solve_double_ended_clipper(params: dict[str, Any]) -> dict[str, float]:
    vm = _param(params, "v_m", "vm", default=10.0)
    v_pos = _param(params, "v_clip_pos", "vclippos", default=5.0)
    v_neg = _param(params, "v_clip_neg", "vclipneg", default=-5.0)
    rl = _param(params, "r_l", "rl", default=10000.0)
    v1 = v_pos - 0.7
    v2 = abs(v_neg) - 0.7
    return {"Vm": vm, "V1": round(v1, 2), "V2": round(v2, 2), "R": 1000.0, "RL": rl}


def solve_opamp_highpass_active(params: dict[str, Any]) -> dict[str, float]:
    fc = _param(params, "f_c", "fc", "target", default=1000.0)
    gain = _param(params, "gain", default=2.0)
    c = _param(params, "c", default=1e-8)
    rg = _param(params, "rg", default=10000.0)
    r1 = 1.0 / (2 * math.pi * fc * c)
    rf = (gain - 1.0) * rg if gain > 1.0 else rg
    return {"C": c, "R1": round(r1, 2), "Rf": round(rf, 2), "Rg": rg}


def solve_opamp_noninverting_amp(params: dict[str, Any]) -> dict[str, float]:
    vin = _param(params, "v_in", "vin", default=1.0)
    vout = _param(params, "v_out", "vout", "target", default=2.0)
    rg = _param(params, "rg", default=1000.0)
    if vin <= 0 or vout <= vin:
        rf = rg
    else:
        gain = vout / vin
        rf = (gain - 1.0) * rg
    return {"v_in": vin, "v_out": vout, "Rg": rg, "Rf": round(rf, 2)}



def solve_voltage_divider_catalog(params: dict[str, Any]) -> dict[str, float]:
    vin = _param(params, "v_in", "vin", default=10.0)
    vout = _param(params, "v_out", "vout", "target", default=5.0)
    r1 = _param(params, "r1", default=10000.0)
    if vout >= vin:
        r2 = 100.0
    else:
        r2 = r1 * vout / (vin - vout)
    return {"Vin": vin, "R1": round(r1, 2), "R2": round(r2, 2)}


def solve_bjt_common_emitter_amp(params: dict[str, Any]) -> dict[str, float]:
    vcc = _param(params, "v_cc", "vcc", default=12.0)
    icq = _param(params, "i_cq", "icq", default=0.002)
    vceq = _param(params, "v_ceq", "vceq", "target", default=vcc / 2.0)
    beta = _param(params, "beta", default=100.0)
    f_low = _param(params, "f_low", "flow", default=20.0)
    rl = _param(params, "r_l", "rl", default=10000.0)

    # 1. VE = 0.1 * VCC => RE = VE / ICQ
    ve = 0.1 * vcc
    re = ve / icq if icq > 0 else 600.0

    # 2. RC = (VCC - VCEQ - VE) / ICQ
    rc = (vcc - vceq - ve) / icq if icq > 0 else 2400.0
    if rc <= 0:
        rc = 1000.0

    # 3. re = 26mV / ICQ
    re_dynamic = 0.026 / icq if icq > 0 else 13.0

    # 4. R_TH = 0.1 * beta * RE, V_TH = 0.7 + VE
    r_th = 0.1 * beta * re
    v_th = 0.7 + ve

    # 5. RB1 y RB2
    rb1 = r_th * vcc / v_th if v_th > 0 else 37890.0
    rb2 = r_th * vcc / (vcc - v_th) if (vcc - v_th) > 0 else 7120.0

    # 6. CE >= 1 / (2*pi*f_low*(re_dynamic || RE))
    r_eq = (re_dynamic * re) / (re_dynamic + re) if (re_dynamic + re) > 0 else re_dynamic
    ce = 1.0 / (2 * math.pi * f_low * r_eq) if (f_low > 0 and r_eq > 0) else 0.001

    return {
        "VCC": vcc,
        "RB1": round(rb1, 1),
        "RB2": round(rb2, 1),
        "RC": round(rc, 1),
        "RE": round(re, 1),
        "CE": round(ce, 6) if ce < 0.01 else round(ce, 4),
        "RL": rl,
        "beta": beta,
        "v_ceq": vceq,
        "i_cq": icq,
    }


def solve_opamp_integrator_practical(params: dict[str, Any]) -> dict[str, float]:
    f_int = _param(params, "f_int", "fint", default=1000.0)
    a_dc = _param(params, "a_dc", "adc", default=10.0)
    cf = _param(params, "c_f", "cf", default=1e-8)

    rin = 1.0 / (2 * math.pi * f_int * cf) if (f_int > 0 and cf > 0) else 10000.0
    rf = a_dc * rin

    return {
        "Rin": round(rin, 1),
        "Rf": round(rf, 1),
        "Cf": cf,
        "a_dc": a_dc,
    }


def solve_sallen_key(params: dict[str, Any]) -> dict[str, float]:
    fo = _param(params, "f_o", "fo", "f_c", "target", default=1000.0)
    c1 = _param(params, "c1", default=1e-8)
    c2 = c1 / 2.0
    r = 1.0 / (2 * math.pi * fo * math.sqrt(c1 * c2))
    return {"R": round(r, 2), "C1": c1, "C2": c2}


CATALOG_SOLVERS = {
    "zener_regulated_power_supply": solve_zener_regulator,
    "linear_zener_regulator": solve_zener_regulator,
    "rc_lowpass_passive": solve_rc_lowpass_passive,
    "bjt_voltage_divider": solve_bjt_voltage_divider,
    "bjt_common_emitter_amp": solve_bjt_common_emitter_amp,
    "diode_clamper": solve_diode_clamper,
    "diode_clipper": solve_diode_clipper,
    "double_ended_clipper": solve_double_ended_clipper,
    "opamp_highpass_active": solve_opamp_highpass_active,
    "opamp_noninverting_amp": solve_opamp_noninverting_amp,
    "opamp_integrator_practical": solve_opamp_integrator_practical,
    "voltage_divider": solve_voltage_divider_catalog,
    "sallen_key_lowpass_butterworth": solve_sallen_key,
}


def solve_catalog_circuit(circuit_id: str, params: dict[str, Any]) -> dict[str, float]:
    """Resuelve los valores numéricos de componentes para una topología del catálogo."""
    solver = CATALOG_SOLVERS.get(circuit_id)
    if solver is not None:
        return solver(params)

    # Si hay un ejemplo numérico o esquema en el catálogo, tomar valores predeterminados
    circuit = fetch_circuit_detail(circuit_id)
    result: dict[str, float] = {}
    if circuit and circuit.parametersSchema:
        for name, spec in circuit.parametersSchema.items():
            val = params.get(name, spec.get("default", 1000.0))
            if isinstance(val, (int, float)):
                result[name] = float(val)
    # Incluir cualquier parámetro que ya haya venido
    for k, v in params.items():
        if isinstance(v, (int, float)):
            result[k] = float(v)
    return result
