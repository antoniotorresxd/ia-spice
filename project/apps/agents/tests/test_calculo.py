import math

import pytest

from agents.calculo.formulas import FORMULAS


def test_voltage_divider_values_satisfy_ratio():
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 3.3})

    r1, r2 = values["r1"], values["r2"]
    assert 5.0 * r2 / (r1 + r2) == pytest.approx(3.3, rel=1e-9)


def test_voltage_divider_unreachable_target_clamps_r2():
    # v_out >= v_in no tiene solución física; el worker no debe producir
    # resistencias negativas — el curador rechazará tras agotar iteraciones
    values = FORMULAS["voltage_divider"]({"v_in": 5.0, "v_out": 6.0})
    assert values["r2"] == 1.0


def test_rc_lowpass_values_hit_cutoff():
    values = FORMULAS["rc_lowpass"]({"f_c": 1000.0})

    f_c = 1.0 / (2 * math.pi * values["r"] * values["c"])
    assert f_c == pytest.approx(1000.0, rel=1e-9)


def test_led_resistor_values_ohms_law():
    values = FORMULAS["led_resistor"]({"v_in": 5.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == pytest.approx((5.0 - 2.0) / 0.02, rel=1e-9)


def test_led_resistor_clamps_minimum_resistance():
    values = FORMULAS["led_resistor"]({"v_in": 2.0, "v_f": 2.0, "i_led": 0.02})
    assert values["r"] == 1.0
