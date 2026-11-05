from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Power Supplies for the input signals and Vdd
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # Vin1 = 1V
circuit.V('in2', 'Vin2', circuit.gnd, 3.0) # Vin2 = 3V (Expected Vout = 3 - 1 = 2V)
# Resistors for the Subtractor circuit (R1 = R2 = R3 = R4 = 10k)
# Vout = (R2/R1) * ((R3+R4)/(R1+R3)) * Vin2 - (R2/R1) * Vin1
# With R1=R2=R3=R4=10k, Vout = Vin2 - Vin1
circuit.R('1', 'Vin1', 'Vminus', 10@u_kΩ)
circuit.R('2', 'Vout', 'Vminus', 10@u_kΩ)
circuit.R('3', 'Vin2', 'Vplus', 10@u_kΩ)
circuit.R('4', 'Vplus', circuit.gnd, 10@u_kΩ)
# Op-Amp subcircuit or behavioral model implementation
# Using a voltage-controlled voltage source (E) with high gain to model an ideal op-amp
# E_name positive_output negative_output positive_input negative_input gain
circuit.X('opamp', 'opamp_model', 'Vplus', 'Vminus', 'Vout', 'Vdd', circuit.gnd)
# Define the subcircuit for the Op-Amp with a very high open-loop gain (e.g., 100,000)
circuit.subcircuit('opamp_model', ['plus', 'minus', 'out', 'vcc', 'vee'])
circuit.E('1', 'out', 'vee', 'plus', 'minus', 100000)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
