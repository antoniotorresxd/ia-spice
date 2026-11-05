from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Power Supplies for the input signals and Op-Amp
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # 1V input 1
circuit.V('in2', 'Vin2', circuit.gnd, 2.0) # 2V input 2
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)  # Positive supply 5V
circuit.V('ss', circuit.gnd, 'Vss', 5.0)  # Negative supply -5V (referenced correctly)
# Resistors for the summing amplifier (R1 = R2 = Rf = 10k ohms)
# To achieve Vout = -(Vin1 + Vin2)
circuit.R('1', 'Vin1', 'Vx', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vx', 10@u_kΩ)
circuit.R('f', 'Vx', 'Vout', 10@u_kΩ)
# Op-Amp Subcircuit or behavioral model connection
# Using a subcircuit or behavioral voltage source for an ideal op-amp:
# Vout = A * (V_non_inverting - V_inverting)
# For an inverting amplifier: non-inverting = gnd, inverting = Vx
# We can model the op-amp using a VCVS (E element) with a very high gain (e.g., 1e5)
circuit.BehavioralSource('opamp', 'Vout', circuit.gnd, value='1e5 * (0 - {Vx})')
# Analysis Part
simulator = circuit.simulator()
