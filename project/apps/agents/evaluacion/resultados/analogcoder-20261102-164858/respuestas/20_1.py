from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Summing Amplifier (Vout = -(Vin1+Vin2))')
# Input voltage sources (DC operating point only)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)   # Vin1 = 1.0 V
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)   # Vin2 = 0.5 V
# Op-amp modeled as high-gain VCVS
# VCVS(name, out_p, out_n, in_p, in_n, gain)
# Non-inverting input grounded, inverting input = Vn
circuit.VCVS('op', 'Vout', circuit.gnd, circuit.gnd, 'Vn', 1e6)
# Input resistors
circuit.R('1', 'Vin1', 'Vn', 10@u_kΩ)       # R1
circuit.R('2', 'Vin2', 'Vn', 10@u_kΩ)       # R2
# Feedback resistor
circuit.R('f', 'Vout', 'Vn', 10@u_kΩ)       # Rf
# Analysis Part
simulator = circuit.simulator()
