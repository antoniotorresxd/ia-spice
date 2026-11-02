from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Summing Amplifier (Opamp Adder)')
# Input DC sources (operating-point only, no AC)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0@u_V)
circuit.V('in2', 'Vin2', circuit.gnd, 0.5@u_V)
# Input resistors to the inverting node (Vneg)
circuit.R('1', 'Vin1', 'Vneg', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vneg', 10@u_kΩ)
# Feedback resistor from output to inverting node
circuit.R('f', 'Vneg', 'Vout', 10@u_kΩ)
# Ideal-type op-amp macro-model: Vout = A * (V(+) - V(-)), with V(+) = ground
# VCVS(name, out+, out-, ctrl+, ctrl-, gain)
circuit.VCVS('op', 'Vout', circuit.gnd, circuit.gnd, 'Vneg', 1e6)
# Analysis Part
simulator = circuit.simulator()
