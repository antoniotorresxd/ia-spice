from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('RC Phase-Shift Oscillator')
# NMOS model
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.7)
# 5 V supply
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# Gate bias divider: approximately 1.6 V at the gate
circuit.R('BT', 'Vdd', 'FB3', 10e6)
circuit.R('BB', 'FB3', circuit.gnd, 4.7e6)
# Common-source amplifier
circuit.MOSFET(
    '1', 'Vout', 'FB3', 'NS', 'NS',
    model='nmos_model', w=100e-6, l=1e-6
)
circuit.R('D', 'Vdd', 'Vout', 47e3)
circuit.R('S', 'NS', circuit.gnd, 10e3)
circuit.C('S', 'NS', circuit.gnd, 100e-6)
# Three-section RC phase-shift feedback network
circuit.C('1', 'Vout', 'FB1', 10e-9)
circuit.R('1', 'FB1', circuit.gnd, 100e3)
circuit.C('2', 'FB1', 'FB2', 10e-9)
circuit.R('2', 'FB2', circuit.gnd, 100e3)
circuit.C('3', 'FB2', 'FB3', 10e-9)
circuit.R('3', 'FB3', circuit.gnd, 100e3)
simulator = circuit.simulator()
