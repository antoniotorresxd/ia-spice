from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Opamp Differentiator')
# 5 V single supply and midpoint reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.R('ref_top', 'Vdd', 'Vref', 100e3)
circuit.R('ref_bottom', 'Vref', circuit.gnd, 100e3)
# DC operating-point bias for the input
circuit.V('in', 'Vin', circuit.gnd, 2.5)
# Differentiator input and feedback components
circuit.C('1', 'Vin', 'Nsum', 10e-9)
circuit.R('f', 'Vout', 'Nsum', 100e3)
# High-gain ideal op-amp:
# Vout = A * (Vref - Nsum)
circuit.VCVS('Aop', 'Vout', circuit.gnd, 'Vref', 'Nsum', 1e5)
simulator = circuit.simulator()
