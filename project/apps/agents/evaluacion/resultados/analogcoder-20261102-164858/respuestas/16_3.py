from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Component values
R_val = 10@u_kΩ
C_val = 10@u_nF
# Ideal inverting amplifier (high-gain VCVS):
# Vout = -A * (V(Vminus) - 0), with non-inverting input grounded
# VCVS parameters: name, out_plus, out_minus, ctrl_plus, ctrl_minus, gain
circuit.VCVS('amp', 'Vout', circuit.gnd, 'Vminus', circuit.gnd, -1e5)
# Three-section RC phase-shift feedback network (Vout -> Vminus)
# Section 1
circuit.C('1', 'Vout', 'n1', C_val)
circuit.R('1', 'n1', circuit.gnd, R_val)
# Section 2
circuit.C('2', 'n1', 'n2', C_val)
circuit.R('2', 'n2', circuit.gnd, R_val)
# Section 3
circuit.C('3', 'n2', 'Vminus', C_val)
circuit.R('3', 'Vminus', circuit.gnd, R_val)
# Analysis Part
simulator = circuit.simulator()
