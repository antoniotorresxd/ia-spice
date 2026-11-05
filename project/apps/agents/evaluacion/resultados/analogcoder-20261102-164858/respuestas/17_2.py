from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Diode model (anti-parallel pair across Rf for amplitude stabilization)
circuit.model('D1N4148', 'D', IS=2.52e-9, N=1.752)
# Op-amp modeled as a high-gain voltage-controlled voltage source
# E1: output Vout (to ground), controlled by V(Pos) - V(-), gain = 1e5
circuit.VCVS('1', 'Vout', circuit.gnd, 'Pos', '-', 1e5)
# Wien bridge frequency-selective network
# Series arm: R1 - C1 from Vout to Pos (via node X)
circuit.R('1', 'Vout', 'X', 10@u_kΩ)
circuit.C('1', 'X', 'Pos', 10@u_nF)
# Parallel arm: R2 || C2 from Pos to ground
circuit.R('2', 'Pos', circuit.gnd, 10@u_kΩ)
circuit.C('2', 'Pos', circuit.gnd, 10@u_nF)
# Non-inverting amplifier gain-setting network (gain = 1 + Rf/Rg = 3.2)
circuit.R('g', '-', circuit.gnd, 10@u_kΩ)
circuit.R('f', 'Vout', '-', 22@u_kΩ)
# Anti-parallel diodes across Rf for amplitude limiting
circuit.Diode('1', 'Vout', '-', model='D1N4148')
circuit.Diode('2', '-', 'Vout', model='D1N4148')
simulator = circuit.simulator()
