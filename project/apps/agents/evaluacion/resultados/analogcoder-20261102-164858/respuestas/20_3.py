from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Adder')
# Input sources (DC only)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)   # Vin1 = 1.0 V
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)   # Vin2 = 0.5 V
# Non-inverting input of the op-amp tied to ground (0 V)
circuit.V('p', 'Vp', circuit.gnd, 0.0)
# Ideal high-gain op-amp: V(Vout) = A * (V(Vp) - V(Vm)), A = 1e6
# VCVS(name, out_p, out_n, in_p, in_n, gain)
circuit.VCVS('op', 'Vout', circuit.gnd, 'Vp', 'Vm', 1e6)
# Input resistors
circuit.R('1', 'Vin1', 'Vm', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vm', 10@u_kΩ)
# Feedback resistor
circuit.R('f', 'Vout', 'Vm', 10@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
