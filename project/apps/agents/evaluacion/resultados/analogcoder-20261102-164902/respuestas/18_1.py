from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Opamp Integrator')
# 5 V supply and 2.5 V single-supply reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# DC operating-point input; the signal is referenced around 2.5 V
circuit.V('in', 'Vin', circuit.gnd, 2.5)
# Inverting integrator input resistor
circuit.R('1', 'Vin', 'Nminus', 10e3)
# Feedback capacitor and large resistor in parallel
circuit.C('f', 'Nminus', 'Vout', 10e-9)
circuit.R('f', 'Nminus', 'Vout', 100e6)
# High-gain op-amp macromodel:
# output is referenced to Vref, with the non-inverting input at Vref
circuit.VCVS('opamp', 'Aout', 'Vref', 'Vref', 'Nminus', 1e5)
# Finite op-amp output resistance
circuit.R('out', 'Aout', 'Vout', 50)
simulator = circuit.simulator()
