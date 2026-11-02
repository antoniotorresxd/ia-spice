from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Power Supplies for the op-amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)  # Positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # Negative power supply
# Input Signal Sources
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # Vin1 = 1.0V
circuit.V('in2', 'Vin2', circuit.gnd, 3.0) # Vin2 = 3.0V (Expected Vout = 3.0 - 1.0 = 2.0V)
# Resistors for the Subtractor (All set to 10 kOhms for unity gain difference)
circuit.R('1', 'Vin1', 'V_inv', 10@u_kΩ)
circuit.R('2', 'V_inv', 'Vout', 10@u_kΩ)
circuit.R('3', 'Vin2', 'V_non', 10@u_kΩ)
circuit.R('4', 'V_non', circuit.gnd, 10@u_kΩ)
# Behavioral Op-Amp implementation using a VCVS (Voltage Controlled Voltage Source)
# Syntax: E(name, positive_output, negative_output, positive_control, negative_control, gain)
# Using a high gain (e.g., 100k) to model an ideal operational amplifier
circuit.element_factory.E('OpAmp', 'Vout', circuit.gnd, 'V_non', 'V_inv', 100e3)
# Analysis Part
simulator = circuit.simulator()
