from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Op-Amp Differentiator')
# 5 V single supply
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# DC input and midpoint reference
circuit.V('in', 'Vin', circuit.gnd, 2.5)
circuit.R('ref_top', 'Vdd', 'Vref', 100e3)
circuit.R('ref_bottom', 'Vref', circuit.gnd, 100e3)
# Inverting differentiator network
circuit.C('1', 'Vin', 'Vsum', 10e-9)
circuit.R('f', 'Vout', 'Vsum', 100e3)
# High-gain op-amp macromodel:
# output = gain * (non-inverting input - inverting input)
circuit.VCVS('A1', 'Vout', circuit.gnd, 'Vref', 'Vsum', 1e5)
simulator = circuit.simulator()
