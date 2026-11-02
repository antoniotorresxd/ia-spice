from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Power Supplies for the op-amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V positive power supply
circuit.V('ss', 'Vss', circuit.gnd, 0.0) # 0V negative power supply (or ground)
# Input Signal Sources for Vin1 and Vin2
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # 1V DC input for Vin1
circuit.V('in2', 'Vin2', circuit.gnd, 3.0) # 3V DC input for Vin2 (Expected Vout = 3 - 1 = 2V)
# Resistors for the Subtractor circuit (all set to 10 kΩ for unity gain: Vout = Vin2 - Vin1)
# R1: Vin1 to inverting node (let's call it 'Vinv')
circuit.R('1', 'Vin1', 'Vinv', 10@u_kΩ)
# R3: Vout to inverting node ('Vinv')
circuit.R('3', 'Vout', 'Vinv', 10@u_kΩ)
# R2: Vin2 to non-inverting node (let's call it 'Vnoninv')
circuit.R('2', 'Vin2', 'Vnoninv', 10@u_kΩ)
# R4: non-inverting node ('Vnoninv') to ground
circuit.R('4', 'Vnoninv', circuit.gnd, 10@u_kΩ)
# Op-Amp subcircuit or behavioral model connection
# Using a voltage-controlled voltage source (VCVS) to model an ideal op-amp with high gain (A = 100k)
# E_name positive_output negative_output positive_input negative_input gain
circuit.X('opamp', 'opamp', 'Vinv', 'Vnoninv', 'Vout', 'Vdd', 'Vss')
# Define the op-amp subcircuit using standard components
circuit.subcircuit('opamp', ['in_neg', 'in_pos', 'out', 'vcc', 'vee'])
circuit.R('in', 'in_pos', 'in_neg', 10e9) # Input resistance
circuit.V('sense', 'out_int', 'vee', 0) # Dummy source for E-element reference if needed, or direct E element:
circuit.E('amp', 'out', circuit.gnd, 'in_pos', 'in_neg', 100e3)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
