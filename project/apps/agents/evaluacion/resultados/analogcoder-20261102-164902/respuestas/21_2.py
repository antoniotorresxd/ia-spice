from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Op-Amp Subtractor')
# DC test inputs: Vout should be approximately 2 V - 1 V = 1 V.
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)
circuit.V('in2', 'Vin2', circuit.gnd, 2.0)
# Matched resistor network: R2/R1 = R4/R3 = 1.
circuit.R('1', 'Vin1', 'Vminus', 10e3)
circuit.R('2', 'Vout', 'Vminus', 10e3)
circuit.R('3', 'Vin2', 'Vplus', 10e3)
circuit.R('4', 'Vplus', circuit.gnd, 10e3)
# High-gain idealized op-amp model:
# output, reference node, positive input, negative input, open-loop gain
circuit.VCVS('A1', 'Vout', circuit.gnd, 'Vplus', 'Vminus', 1e5)
simulator = circuit.simulator()
