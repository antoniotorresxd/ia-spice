from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supply and Reference Biasing (Mid-rail reference for single 5V supply)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)
circuit.V('ref', 'Vref', circuit.gnd, 2.5@u_V)
# Input Voltage Source (DC Operating Point)
circuit.V('in', 'Vin', circuit.gnd, 2.5@u_V)
# Passive Components
# R1 connects between Vin and the inverting node Vn
circuit.R('1', 'Vin', 'Vn', 10@u_kΩ)
# Cf connects between the inverting node Vn and the output node Vout
circuit.C('f', 'Vn', 'Vout', 10@u_nF)
# High-gain Voltage-Controlled Voltage Source (VCVS) modeling the Operational Amplifier
# Parameters: name, output_pos, output_neg, input_pos, input_neg, gain
circuit.VCVS('OPAMP', 'Vout', 'Vref', 'Vref', 'Vn', 1e5)
# Analysis Part
simulator = circuit.simulator()
