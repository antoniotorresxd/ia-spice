from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Power Supplies for the input signals and Vdd
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # Vin1 = 1V
circuit.V('in2', 'Vin2', circuit.gnd, 3.0) # Vin2 = 3V (Expected Vout = 3V - 1V = 2V)
# Resistors for the Subtractor (Difference Amplifier)
# For Vout = Vin2 - Vin1, R1 = R2 = R3 = R4 = 10k ohms
resistance_value = 10@u_kΩ
circuit.R('1', 'Vin1', 'Vn', resistance_value)
circuit.R('2', 'Vn', 'Vout', resistance_value)
circuit.R('3', 'Vin2', 'Vp', resistance_value)
circuit.R('4', 'Vp', circuit.gnd, resistance_value)
# Behavioral Op-Amp Model using VCVS (Voltage-Controlled Voltage Source)
# E_name positive_output negative_output positive_input negative_input gain
# High gain (e.g., 100k) approximates an ideal operational amplifier
circuit.BehavioralV('opamp', 'Vout', circuit.gnd, 'Vp', 'Vn', 100000.0)
# Analysis Part
simulator = circuit.simulator()
