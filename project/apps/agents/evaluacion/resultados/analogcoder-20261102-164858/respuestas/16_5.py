from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Ideal inverting amplifier (VCVS) with gain -50
# Vout = -50 * (V(Vminus) - V(gnd)), Vminus is the "-" (inverting) input node
circuit.VCVS('amp', 'Vout', circuit.gnd, 'Vminus', circuit.gnd, gain=-50)
# Three-section RC phase-shift feedback network (Vout -> Vminus)
circuit.R('1', 'Vout', 'N1', 10@u_kΩ)
circuit.C('1', 'N1', circuit.gnd, 10@u_nF)
circuit.R('2', 'N1', 'N2', 10@u_kΩ)
circuit.C('2', 'N2', circuit.gnd, 10@u_nF)
circuit.R('3', 'N2', 'Vminus', 10@u_kΩ)
circuit.C('3', 'Vminus', circuit.gnd, 10@u_nF)
# DC bias path for the high-impedance inverting input node
circuit.R('bias', 'Vminus', circuit.gnd, 1000@u_kΩ)
simulator = circuit.simulator()
