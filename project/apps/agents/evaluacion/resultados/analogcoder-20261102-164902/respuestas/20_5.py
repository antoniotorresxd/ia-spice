from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Inverting Op-Amp Adder')
# Dual supplies: the negative rail allows Vout to go below ground.
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ee', 'Vee', circuit.gnd, -5.0)
# DC operating-point test inputs
circuit.V('in1', 'Vin1', circuit.gnd, 0.1)
circuit.V('in2', 'Vin2', circuit.gnd, 0.1)
# Equal input and feedback resistors give Vout = -(Vin1 + Vin2).
circuit.R('1', 'Vin1', 'Vsum', 10e3)
circuit.R('2', 'Vin2', 'Vsum', 10e3)
circuit.R('f', 'Vout', 'Vsum', 10e3)
# Ideal high-gain op-amp macromodel:
# Vout = A * (Vplus - Vminus), with Vplus grounded.
circuit.VCVS('opamp', 'Vout', circuit.gnd, circuit.gnd, 'Vsum', 1e6)
simulator = circuit.simulator()
