from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Unity-Gain Op-Amp Subtractor')
# Supply and DC input values for operating-point simulation
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in1', 'Vin1', circuit.gnd, 2.5)
circuit.V('in2', 'Vin2', circuit.gnd, 2.6)
# Matched resistor network: unity-gain difference amplifier
circuit.R('1', 'Vin1', 'Nminus', 10e3)
circuit.R('2', 'Vout', 'Nminus', 10e3)
circuit.R('3', 'Vin2', 'Nplus', 10e3)
circuit.R('4', 'Nplus', circuit.gnd, 10e3)
# High-gain op-amp macro-model:
# output terminals, non-inverting control node, inverting control node, gain
circuit.VCVS('A1', 'Vout', circuit.gnd, 'Nplus', 'Nminus', 1e6)
simulator = circuit.simulator()
