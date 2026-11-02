from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Input sources (DC operating point only)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)   # Vin1 = 1.0 V
circuit.V('in2', 'Vin2', circuit.gnd, 2.5)   # Vin2 = 2.5 V
# Ideal op-amp macro-model (VCVS with high open-loop gain)
# VCVS(name, out+, out-, in+, in-, gain)
# Non-inverting input: Vp, inverting input: Vn, output: Vout
circuit.VCVS('op', 'Vout', circuit.gnd, 'Vp', 'Vn', 1e6)
# Difference amplifier resistor network (all 10 kOhm)
circuit.R('1', 'Vin1', 'Vn', 10@u_kΩ)     # R1: Vin1 -> inverting node
circuit.R('4', 'Vn', 'Vout', 10@u_kΩ)     # R4: feedback Vout -> inverting node
circuit.R('2', 'Vin2', 'Vp', 10@u_kΩ)     # R2: Vin2 -> non-inverting node
circuit.R('3', 'Vp', circuit.gnd, 10@u_kΩ) # R3: non-inverting node -> ground
# Analysis Part
simulator = circuit.simulator()
