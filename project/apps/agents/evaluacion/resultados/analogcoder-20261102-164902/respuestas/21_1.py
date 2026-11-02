from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# DC input values for the operating-point circuit
circuit.V('in1', 'Vin1', circuit.gnd, 1.0 @ u_V)
circuit.V('in2', 'Vin2', circuit.gnd, 2.0 @ u_V)
# Matched resistor network
circuit.R('1', 'Vin2', 'Vplus', 10 @ u_kΩ)
circuit.R('2', 'Vplus', circuit.gnd, 10 @ u_kΩ)
circuit.R('3', 'Vin1', 'Vminus', 10 @ u_kΩ)
circuit.R('f', 'Vout', 'Vminus', 10 @ u_kΩ)
# High-gain ideal op-amp represented by a voltage-controlled voltage source
circuit.VCVS('opamp', 'Vout', circuit.gnd, 'Vplus', 'Vminus', 1e6)
simulator = circuit.simulator()
