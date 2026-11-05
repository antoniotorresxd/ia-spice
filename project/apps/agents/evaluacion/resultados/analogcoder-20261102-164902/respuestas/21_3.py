from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Supply rails for a bipolar-output implementation
circuit.V('dd', 'Vdd', circuit.gnd, 5@u_V)
circuit.V('ss', 'Vss', circuit.gnd, -5@u_V)
# DC input examples
circuit.V('in1', 'Vin1', circuit.gnd, 2.5@u_V)
circuit.V('in2', 'Vin2', circuit.gnd, 3.0@u_V)
# Matched resistor network
circuit.R('1', 'Vin1', 'Vminus', 10@u_kΩ)
circuit.R('2', 'Vout', 'Vminus', 10@u_kΩ)
circuit.R('3', 'Vin2', 'Vplus', 10@u_kΩ)
circuit.R('4', 'Vplus', circuit.gnd, 10@u_kΩ)
# High-gain op-amp macromodel: output = gain * (Vplus - Vminus)
circuit.VCVS('A1', 'Vout', circuit.gnd, 'Vplus', 'Vminus', voltage_gain=1e6)
simulator = circuit.simulator()
