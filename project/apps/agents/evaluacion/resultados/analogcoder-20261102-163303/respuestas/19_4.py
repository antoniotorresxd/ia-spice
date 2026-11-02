from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Power Supplies and Input Signal
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('ss', circuit.gnd, 'Vss', 5.0) # -5V equivalent or dual supply reference
circuit.V('in', 'Vin', circuit.gnd, 1.0) # 1V DC operating point input
# Passive Components for Differentiator
# C1 connected between Vin and the inverting input (Vinv)
circuit.C('1', 'Vin', 'Vinv', 1@u_uF)
# Rf connected between Vout and the inverting input (Vinv)
circuit.R('f', 'Vout', 'Vinv', 100@u_kΩ)
# Resistor to ground for non-inverting terminal to balance bias currents
circuit.R('bias', 'Vinv_pos', circuit.gnd, 1@u_kΩ)
circuit.controller.match_node('Vinv_pos', circuit.gnd)
# Define a simple behavioral Opamp using a Voltage-Controlled Voltage Source (E element)
# Gain is set high (e.g., 100k) to emulate an ideal op-amp
# E(name, positive_output, negative_output, positive_input, negative_input, gain)
# Non-inverting input is connected to gnd, inverting input is connected to 'Vinv'
circuit.X('opamp', 'opamp_sub', 'Vout', 'gnd', 'Vinv')
# Since PySpice needs a subcircuit definition for complex blocks like opamps, 
# we can define a simple subcircuit for an opamp using a VCVS:
circuit.subcircuit('opamp_sub', 'out', 'plus', 'minus')
circuit.E('opamp_vcvs', 'out', circuit.gnd, 'plus', 'minus', 100000)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
