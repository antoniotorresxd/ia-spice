from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Op-Amp Differentiator')
# 5 V supply and DC input for operating-point analysis
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 2.5)
# Mid-supply reference: Vref = 2.5 V
circuit.R('ref1', 'Vdd', 'Vref', 100e3)
circuit.R('ref2', 'Vref', circuit.gnd, 100e3)
# Differentiating input capacitor and feedback resistor
circuit.C('1', 'Vin', 'Vminus', 10e-9)
circuit.R('f', 'Vout', 'Vminus', 100e3)
# Idealized op-amp macro-model:
# Vout = 1e5 * (Vref - Vminus)
circuit.VCVS('A1', 'Vout', circuit.gnd, 'Vref', 'Vminus', 1e5)
simulator = circuit.simulator()
