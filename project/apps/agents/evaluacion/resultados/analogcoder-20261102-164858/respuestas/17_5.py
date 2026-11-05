from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Ideal op-amp modeled as a high-gain VCVS
# parameters: name, out+, out-, in+, in-, gain
circuit.VCVS('1', 'Vout', circuit.gnd, 'Vp', '-', 1e5)
# Wien bridge frequency-selective network (f0 ~ 1.59 kHz)
circuit.R('1', 'Vout', 'Nmid', 10@u_kΩ)   # series R1
circuit.C('1', 'Nmid', 'Vp', 10@u_nF)     # series C1
circuit.R('2', 'Vp', circuit.gnd, 10@u_kΩ)  # parallel R2
circuit.C('2', 'Vp', circuit.gnd, 10@u_nF)  # parallel C2
# Amplitude-control (negative feedback) network, gain = 1 + R3/R4 = 3.2
circuit.R('3', 'Vout', '-', 22@u_kΩ)      # feedback R3
circuit.R('4', '-', circuit.gnd, 10@u_kΩ)   # ground leg R4
# Analysis Part
simulator = circuit.simulator()
