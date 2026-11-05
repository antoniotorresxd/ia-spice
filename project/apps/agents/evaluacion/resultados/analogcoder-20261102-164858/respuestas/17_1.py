from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Diode model for amplitude stabilization
circuit.model('DMOD', 'D', Is=1e-14, N=1.0)
# Op-amp modeled as a high-gain voltage-controlled voltage source
# VCVS(name, out_plus, out_minus, in_plus, in_minus, gain)
circuit.VCVS('OP', 'Vout', circuit.gnd, 'Vplus', 'Vminus', 1e5)
# Positive feedback: Wien bridge (frequency-selective network)
# Series RC arm: Vout -> N1 -> Vplus
circuit.R('1', 'Vout', 'N1', 10@u_kΩ)
circuit.C('1', 'N1', 'Vplus', 10@u_nF)
# Shunt RC arm: Vplus -> ground
circuit.R('2', 'Vplus', circuit.gnd, 10@u_kΩ)
circuit.C('2', 'Vplus', circuit.gnd, 10@u_nF)
# Negative feedback: gain setting network with amplitude limiting diodes
circuit.R('3', 'Vout', 'Vminus', 21@u_kΩ)
circuit.R('4', 'Vminus', circuit.gnd, 10@u_kΩ)
# Anti-parallel diodes across R3 for amplitude stabilization
circuit.D('1', 'Vout', 'Vminus', model='DMOD')
circuit.D('2', 'Vminus', 'Vout', model='DMOD')
# Analysis Part
simulator = circuit.simulator()
