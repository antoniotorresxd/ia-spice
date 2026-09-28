import os

import pytest

from agents.shell.curve import extract_curve, plan_curve

DIVIDER = """.title Voltage Divider
Vinput vin 0 5.0
R1 vin vout 1000
R2 vout 0 2000
.control
op
wrdata output.txt v(vout)
.endc
.end
"""

ZENER = """* Linear Zener Regulated Power Supply
Vdc vfiltro 0 DC 14.07
RZ vfiltro vout 92.18
DZ 0 vout DZENER
RL vout 0 180.0
.model DZENER D(BV=9.0 IBV=5m RS=0.5)
.control
op
wrdata output.txt v(vout)
.endc
.end
"""

RC_LOWPASS = """* RC Lowpass Filter
Vin vin 0 DC 0 AC 1
R1 vin vout 1k
C1 vout 0 159n
.control
ac dec 100 1 1e9
meas ac fc WHEN vdb(vout)=-3.0103
echo $&fc > output.txt
.endc
.end
"""

CLIPPER = """* Clipper
Vin vin 0 SIN(0 5 1000)
R1 vin vout 1k
D1 vout vbias DIODE_1N4148
Vbias vbias 0 DC 2
RL vout 0 10k
.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)
.control
tran 1u 5m 3m
meas tran vclip MAX v(vout) from=3m to=5m
echo $&vclip > output.txt
.endc
.end
"""

BJT_BIAS = """* BJT Bias
VCC vcc 0 DC 12
RB1 vcc vb 47k
RB2 vb 0 10k
RC vcc vc 2.2k
RE ve 0 1k
Q1 vc vb ve NPN_MODEL
.model NPN_MODEL NPN(BF=100)
.control
op
let vceq = v(vc) - v(ve)
echo $&vceq > output.txt
.endc
.end
"""

# Nodo de salida con un nombre arbitrario y un `quit` antes de .endc: lo que
# un netlist `generic` escrito por el LLM trae a menudo.
GENERIC_WITH_QUIT = """* generic
V1 a 0 DC -6
R1 a n2 1k
R2 n2 0 1k
.control
op
wrdata output.txt v(n2)
quit
.endc
.end
"""

EXISTING_DC_SWEEP = """* dc sweep
V1 a 0 DC 1
R1 a b 1k
R2 b 0 1k
.control
dc V1 0 10 0.5
wrdata output.txt v(b)
.endc
.end
"""

BROKEN = """.title Broken
Rbad a b notanumber
.control
op
.endc
.end
"""


def _write(tmp_path, text):
    path = tmp_path / "circuit.cir"
    path.write_text(text)
    return str(path)


def test_plan_sweeps_the_first_source_for_an_op_analysis():
    plan = plan_curve(DIVIDER)

    assert plan["analysis_type"] == "dc"
    assert plan["x_label"] == "Vinput"
    assert plan["x_unit"] == "V"
    assert plan["vector"] == "v(vout)"


def test_plan_takes_the_vector_the_netlist_actually_measures():
    assert plan_curve(GENERIC_WITH_QUIT)["vector"] == "v(n2)"
    assert plan_curve(BJT_BIAS)["vector"] == "v(vc)"


def test_plan_uses_decibels_for_ac():
    plan = plan_curve(RC_LOWPASS)

    assert plan["analysis_type"] == "ac"
    assert plan["vector"] == "vdb(vout)"
    assert (plan["x_unit"], plan["y_unit"]) == ("Hz", "dB")


def test_plan_returns_none_without_a_control_block():
    assert plan_curve("* nada\nR1 a 0 1k\n.end\n") is None


def test_op_divider_becomes_a_linear_transfer_curve(tmp_path):
    result = extract_curve(_write(tmp_path, DIVIDER))

    assert result["analysis_type"] == "dc"
    assert len(result["curve"]) >= 50
    for point in result["curve"]:
        assert point["y"] == pytest.approx(point["x"] * 2 / 3, abs=1e-6)
    assert result["curve"][-1]["x"] == pytest.approx(7.5)


def test_op_zener_curve_shows_regulation(tmp_path):
    curve = extract_curve(_write(tmp_path, ZENER))["curve"]

    assert curve[-1]["x"] == pytest.approx(14.07 * 1.5, rel=1e-3)
    assert curve[-1]["y"] == pytest.approx(9.0, abs=0.2)
    assert curve[0]["y"] == pytest.approx(0.0, abs=1e-6)


def test_ac_curve_is_a_bode_magnitude(tmp_path):
    result = extract_curve(_write(tmp_path, RC_LOWPASS))

    assert result["x_unit"] == "Hz"
    assert result["curve"][0]["y"] == pytest.approx(0.0, abs=0.1)
    assert result["curve"][-1]["y"] < -60


def test_tran_curve_is_a_waveform(tmp_path):
    result = extract_curve(_write(tmp_path, CLIPPER))

    assert result["analysis_type"] == "tran"
    assert len(result["curve"]) >= 50
    assert max(p["y"] for p in result["curve"]) < 3.5


def test_quit_before_endc_does_not_skip_the_curve(tmp_path):
    result = extract_curve(_write(tmp_path, GENERIC_WITH_QUIT))

    assert len(result["curve"]) >= 50
    assert result["curve"][0]["x"] == pytest.approx(-9.0)
    assert result["curve"][0]["y"] == pytest.approx(-4.5, abs=1e-6)


def test_an_existing_dc_sweep_is_reused(tmp_path):
    result = extract_curve(_write(tmp_path, EXISTING_DC_SWEEP))

    assert result["analysis_type"] == "dc"
    assert result["x_label"] == "V1"
    assert result["curve"][-1] == {"x": pytest.approx(10.0), "y": pytest.approx(5.0)}


def test_curve_run_leaves_the_measured_netlist_and_output_untouched(tmp_path):
    path = _write(tmp_path, DIVIDER)

    extract_curve(path)

    assert (tmp_path / "circuit.cir").read_text() == DIVIDER
    assert not (tmp_path / "output.txt").exists()


def test_broken_netlist_yields_no_curve_instead_of_raising(tmp_path):
    assert extract_curve(_write(tmp_path, BROKEN)) is None


def test_missing_file_yields_no_curve():
    assert extract_curve(os.path.join("/ruta/que/no/existe", "c.cir")) is None
