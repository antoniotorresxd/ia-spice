import pytest

from agents.calculo.catalog_solver import (
    solve_bjt_voltage_divider,
    solve_catalog_circuit,
    solve_rc_lowpass_passive,
    solve_zener_regulator,
)


def test_solve_zener_regulator_matches_numerical_example():
    params = {
        "v_z": 9.0,
        "i_l_max": 0.05,
        "v_sec_rms": 12.0,
        "v_ripple": 1.5,
        "f_line": 60.0,
        "i_z_min": 0.005,
    }
    result = solve_zener_regulator(params)
    assert result["Vin_min"] == 14.07
    assert result["RZ"] == 92.18
    assert result["RL"] == 180.0
    assert result["VZ"] == 9.0


def test_solve_catalog_circuit_dispatches_correctly():
    zener = solve_catalog_circuit(
        "zener_regulated_power_supply",
        {"v_z": 9, "i_l_max": 0.05, "v_sec_rms": 12},
    )
    assert "RZ" in zener
    assert "RL" in zener
    assert zener["VZ"] == 9.0

    rc = solve_catalog_circuit(
        "rc_lowpass_passive",
        {"f_c": 1000, "c": 1e-8},
    )
    assert "R" in rc
    assert rc["C"] == 1e-8

    bjt = solve_catalog_circuit(
        "bjt_voltage_divider",
        {"v_cc": 12, "i_cq": 0.002, "v_ceq": 6},
    )
    assert "RC" in bjt
    assert "RE" in bjt

    bjt_ce = solve_catalog_circuit(
        "bjt_common_emitter_amp",
        {"v_cc": 12, "i_cq": 0.002, "v_ceq": 6, "beta": 100, "r_l": 10000, "f_low": 20},
    )
    assert bjt_ce["RE"] == 600.0
    assert bjt_ce["RC"] == 2400.0
    assert pytest.approx(bjt_ce["RB1"], abs=10) == 37890.0
    assert pytest.approx(bjt_ce["RB2"], abs=10) == 7120.0
    assert "CE" in bjt_ce

