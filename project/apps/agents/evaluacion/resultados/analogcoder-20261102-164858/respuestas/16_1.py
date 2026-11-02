from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Device models (lambda gives finite output resistance for the active load)
circuit.model('nmos_model', 'nmos', level=1, kp=200e-6, vto=0.5, **{'lambda': 0.02})
circuit.model('pmos_model', 'pmos', level=1, kp=100e-6, vto=-0.5, **{'lambda': 0.02})
# Power supply and DC bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)     # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0) # NMOS gate bias = Vth + 0.5 V
circuit.V('bp', 'Vbp', circuit.gnd, 4.0)     # PMOS gate bias = Vdd - |Vth| - 0.5 V
# Inverting amplifier core
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Vout', '-', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vbp', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
# Three-section RC phase-shift feedback network (R = 100 kOhm, C = 1 nF)
R_val = 100e3
C_val = 1e-9
circuit.C('1', 'Vout', 'n1', C_val)
circuit.R('1', 'n1', circuit.gnd, R_val)
circuit.C('2', 'n1', 'n2', C_val)
circuit.R('2', 'n2', circuit.gnd, R_val)
circuit.C('3', 'n2', '-', C_val)
circuit.R('3', '-', 'Vbias', R_val)  # shunt resistor of the last section; also sets gate DC bias
# Analysis Part
simulator = circuit.simulator()
