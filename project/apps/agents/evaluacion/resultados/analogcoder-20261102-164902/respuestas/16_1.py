from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('RC Phase-Shift Oscillator')
# NMOS model
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# 5 V supply
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# Common-source amplifier and drain load
circuit.MOSFET(
    '1', 'Vout', 'Vg', circuit.gnd, circuit.gnd,
    model='nmos_model', w=500e-6, l=1e-6
)
circuit.R('D', 'Vdd', 'Vout', 6.8e3)
# Three-section RC phase-shift network
circuit.R('1', 'Vout', 'N1', 10e3)
circuit.R('2', 'N1', 'N2', 10e3)
circuit.R('3', 'N2', 'N3', 10e3)
circuit.C('1', 'N1', circuit.gnd, 10e-9)
circuit.C('2', 'N2', circuit.gnd, 10e-9)
circuit.C('3', 'N3', circuit.gnd, 10e-9)
# AC feedback coupling to the biased amplifier gate
circuit.C('4', 'N3', 'Vg', 1e-6)
# Gate-bias divider; Vg is approximately 0.63 V
circuit.R('B1', 'Vdd', 'Vg', 4.7e6)
circuit.R('B2', 'Vg', circuit.gnd, 680e3)
simulator = circuit.simulator()
