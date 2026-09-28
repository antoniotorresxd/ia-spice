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



# --- Circuitos de diodos con entrada senoidal -------------------------------
#
# Regresión: el recortador a dos niveles calculaba V2 = |V_clip_neg| - 0.7
# (magnitud positiva) mientras la plantilla la conecta como `V2 v2node 0`, así
# que la rama inferior recortaba en +2.3 V en vez de en -3.7 V. Además, las
# plantillas fijaban 1 kHz y la ventana de `tran`, ignorando la frecuencia
# pedida, y la del clamper referenciaba {tstep}/{tstop}/{tstart} sin que nadie
# los calculara.

import os
import subprocess

from agents.calculo.catalog_solver import (
    solve_diode_clamper,
    solve_diode_clipper,
    solve_double_ended_clipper,
)
from agents.escritura.netlist import build_catalog_netlist

USER_SLICER_REQUEST = {"v_m": 15, "v_clip_pos": 5.7, "v_clip_neg": -3.7, "r_l": 100000}


def test_double_ended_clipper_biases_the_negative_branch_below_ground():
    values = solve_double_ended_clipper(USER_SLICER_REQUEST)

    assert values["V1"] == pytest.approx(5.0)
    assert values["V2"] == pytest.approx(-3.0)


def test_double_ended_clipper_supports_a_window_above_ground():
    # Ambos niveles positivos: el signo tiene que salir de la fórmula, no de abs().
    values = solve_double_ended_clipper({"v_m": 10, "v_clip_pos": 5.7, "v_clip_neg": 2.0})

    assert values["V2"] == pytest.approx(2.7)


def test_diode_clipper_reads_v_recorte_and_fills_vbias():
    values = solve_diode_clipper({"v_m": 20, "v_recorte": 10.7})

    assert values["Vbias"] == pytest.approx(10.0)


@pytest.mark.parametrize(
    "solver, params",
    [
        (solve_double_ended_clipper, {**USER_SLICER_REQUEST, "f": 50}),
        (solve_diode_clipper, {"v_m": 20, "v_recorte": 10.7, "freq": 50}),
        (solve_diode_clamper, {"v_m": 10, "freq": 50}),
    ],
)
def test_sine_circuits_scale_the_transient_window_with_frequency(solver, params):
    values = solver(params)

    assert values["freq"] == 50
    assert values["tstop"] == pytest.approx(5 / 50)
    assert values["tstart"] == pytest.approx(3 / 50)
    assert values["tstep"] == pytest.approx(1 / 50 / 1000)


@pytest.mark.parametrize(
    "circuit_id, params",
    [
        ("double_ended_clipper", USER_SLICER_REQUEST),
        ("diode_clipper", {"v_m": 20, "v_recorte": 10.7}),
        ("diode_clamper", {"v_m": 10, "freq": 1000}),
    ],
)
def test_catalog_template_resolves_every_placeholder(circuit_id, params):
    """La síntesis determinista (la que usan los ajustes del curador) no puede
    dejar placeholders: build_catalog_netlist lanza si queda alguno."""
    values = solve_catalog_circuit(circuit_id, params)

    netlist = build_catalog_netlist({"circuit_id": circuit_id, "params": params}, values)

    assert "{" not in netlist


def _simulate_min_max(netlist: str, tmp_path) -> tuple[float, float]:
    probe = netlist.replace(
        ".endc",
        "meas tran vmax MAX v(vout) from={a} to={b}\nmeas tran vmin MIN v(vout) from={a} to={b}\n.endc",
    )
    lines = {l.split()[0]: l.split() for l in probe.splitlines() if l.strip().lower().startswith("tran ")}
    _, _, tstop, tstart = lines["tran"]
    probe = probe.replace("{a}", tstart).replace("{b}", tstop)
    path = tmp_path / "probe.cir"
    path.write_text(probe)
    out = subprocess.run(["ngspice", "-b", str(path)], cwd=tmp_path, capture_output=True, text=True, timeout=30).stdout
    measured = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0] in ("vmax", "vmin") and parts[1] == "=":
            measured[parts[0]] = float(parts[2])
    return measured["vmax"], measured["vmin"]


@pytest.mark.parametrize("freq", [1000, 50])
def test_user_slicer_request_clips_both_limits_in_ngspice(tmp_path, freq):
    params = {**USER_SLICER_REQUEST, "f": freq}
    values = solve_catalog_circuit("double_ended_clipper", params)
    netlist = build_catalog_netlist({"circuit_id": "double_ended_clipper", "params": params}, values)

    vmax, vmin = _simulate_min_max(netlist, tmp_path)

    assert vmax == pytest.approx(5.7, abs=0.1)
    assert vmin == pytest.approx(-3.7, abs=0.1)


def test_diode_clamper_capacitor_meets_its_own_time_constant_rule():
    # Restricción del catálogo: RL·C >= 10·T. La fórmula dividía además entre
    # 2π, dejando C ~6 veces más chico y la salida lejos de 2·Vm - 0.7.
    values = solve_diode_clamper({"v_m": 10, "freq": 1000, "r_l": 10000})

    assert values["RL"] * values["C"] == pytest.approx(10 / 1000)


def test_diode_clamper_shifts_the_peak_to_twice_vm_in_ngspice(tmp_path):
    params = {"v_m": 10, "freq": 1000}
    values = solve_catalog_circuit("diode_clamper", params)
    netlist = build_catalog_netlist({"circuit_id": "diode_clamper", "params": params}, values)

    vmax, _ = _simulate_min_max(netlist, tmp_path)

    assert vmax == pytest.approx(2 * 10 - 0.7, rel=0.05)
