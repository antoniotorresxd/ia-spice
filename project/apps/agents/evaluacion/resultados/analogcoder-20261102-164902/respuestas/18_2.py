from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Opamp Integrator')
# Supply rail; the ideal VCVS op-amp model below has no power pins.
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# DC operating-point input; no AC signal is applied.
circuit.V('in', 'Vin', circuit.gnd, 0.0)
# Inverting integrator network
circuit.R('1', 'Vin', 'Nsum', 10e3)
circuit.C('f', 'Vout', 'Nsum', 1e-6)
# High-gain op-amp abstraction:
# output = gain * (non-inverting input - inverting input)
circuit.VCVS('Aop', 'Vout', circuit.gnd, circuit.gnd, 'Nsum', 1e6)
simulator = circuit.simulator()
