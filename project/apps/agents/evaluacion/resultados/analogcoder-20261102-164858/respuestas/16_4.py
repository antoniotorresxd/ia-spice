from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Ideal inverting amplifier (op-amp modelled as a high-gain VCVS)
# Non-inverting input grounded, inverting input = Vminus (virtual ground)
# Vout = -A * V(Vminus), A = 1e6
circuit.VCVS('amp', 'Vout', circuit.gnd, circuit.gnd, 'Vminus', 1e6)
# Feedback resistor (gain = Rf / R = 300k / 10k = 30)
circuit.R('f', 'Vminus', 'Vout', 300@u_kΩ)
# Three-section RC phase-shift ladder from Vout to Vminus
circuit.R('1', 'Vout', 'n1', 10@u_kΩ)
circuit.C('1', 'n1', circuit.gnd, 10@u_nF)
circuit.R('2', 'n1', 'n2', 10@u_kΩ)
circuit.C('2', 'n2', circuit.gnd, 10@u_nF)
circuit.R('3', 'n2', 'n3', 10@u_kΩ)
circuit.C('3', 'n3', circuit.gnd, 10@u_nF)
# Input resistor of the inverting amplifier
circuit.R('4', 'n3', 'Vminus', 10@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
