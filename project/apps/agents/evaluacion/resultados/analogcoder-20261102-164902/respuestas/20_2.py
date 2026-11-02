from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Op-Amp Adder')
# Dual supplies: the negative rail permits a negative output voltage.
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# DC input operating-point values.
circuit.V('in1', 'Vin1', circuit.gnd, 0.5)
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)
# Equal input and feedback resistors give Vout = -(Vin1 + Vin2).
circuit.R('1', 'Vin1', 'Summing', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Summing', 10@u_kΩ)
circuit.R('f', 'Vout', 'Summing', 10@u_kΩ)
# High-gain ideal op-amp model:
# output = gain * (non-inverting input - inverting input).
circuit.VCVS('opamp', 'Vout', circuit.gnd, circuit.gnd, 'Summing', 1e6)
simulator = circuit.simulator()
