from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('RC Phase-Shift Oscillator')
# NMOS model
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# DC supplies and bias
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('bias', 'Vbias', circuit.gnd, 0.6)
# Common-source amplifier
circuit.MOSFET(
    '1', 'D1', 'Gate', circuit.gnd, circuit.gnd,
    model='nmos_model', w=5e-6, l=1e-6
)
circuit.R('D', 'D1', 'Vdd', 1e6)
# Source-follower output buffer
circuit.MOSFET(
    '2', 'Vdd', 'D1', 'Vout', 'Vout',
    model='nmos_model', w=10e-6, l=1e-6
)
circuit.R('LOAD', 'Vout', circuit.gnd, 100e3)
# Three-section RC feedback network
circuit.C('1', 'Vout', 'N1', 10e-9)
circuit.R('1', 'N1', circuit.gnd, 100e3)
circuit.C('2', 'N1', 'N2', 10e-9)
circuit.R('2', 'N2', circuit.gnd, 100e3)
circuit.C('3', 'N2', 'Gate', 10e-9)
circuit.R('3', 'Gate', 'Vbias', 100e3)
simulator = circuit.simulator()
