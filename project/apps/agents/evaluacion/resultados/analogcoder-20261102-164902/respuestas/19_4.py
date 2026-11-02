from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Op-Amp Differentiator')
# Single 5 V supply and mid-supply reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.R('ref1', 'Vdd', 'Vref', 100e3)
circuit.R('ref2', 'Vref', circuit.gnd, 100e3)
# DC operating-point bias for the input; the signal varies around Vref
circuit.V('in', 'Vin', circuit.gnd, 2.5)
# Inverting differentiator network
circuit.C('1', 'Vin', 'Vminus', 10e-9)
circuit.R('f', 'Vout', 'Vminus', 100e3)
# Idealized op-amp represented by a finite-gain VCVS:
# output+, output-, control+, control-, voltage gain
circuit.VCVS('opamp', 'Vout', circuit.gnd, 'Vref', 'Vminus', 1e6)
simulator = circuit.simulator()
