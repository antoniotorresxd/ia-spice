from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('RC Phase-Shift Oscillator')
# NMOS model and 5 V supply
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# Common-source amplifier
circuit.MOSFET(
    '1', 'Vout', 'Vg', circuit.gnd, circuit.gnd,
    model='nmos_model', w=80e-6, l=1e-6
)
circuit.R('D', 'Vdd', 'Vout', 100e3)
# Three-section RC phase-shift feedback ladder
circuit.C('1', 'Vout', 'N1', 1e-9)
circuit.R('1', 'N1', circuit.gnd, 1e6)
circuit.C('2', 'N1', 'N2', 1e-9)
circuit.R('2', 'N2', circuit.gnd, 1e6)
circuit.C('3', 'N2', 'Vg', 1e-9)
circuit.R('3', 'Vg', circuit.gnd, 1e6)
# Gate-bias network; the ladder's final resistor also loads Vg at DC
circuit.R('bias_top', 'Vdd', 'Vg', 6.8e6)
circuit.R('bias_bottom', 'Vg', circuit.gnd, 10e6)
simulator = circuit.simulator()
