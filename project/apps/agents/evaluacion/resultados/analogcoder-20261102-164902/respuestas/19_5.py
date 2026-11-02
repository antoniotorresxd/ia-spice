from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Differentiator')
# Supply and DC input for operating-point analysis
circuit.V('dd', 'Vdd', circuit.gnd, 5@u_V)
circuit.V('in', 'Vin', circuit.gnd, 0@u_V)
# Non-inverting input held at ground
circuit.V('plus', 'Vplus', circuit.gnd, 0@u_V)
# Differentiator components
circuit.C('1', 'Vin', 'nminus', 10@u_nF)
circuit.R('f', 'Vout', 'nminus', 100@u_kΩ)
# High-gain idealized op-amp model:
# Vout = 100,000 * (Vplus - Vminus)
circuit.VCVS('opamp', 'Vout', circuit.gnd, 'Vplus', 'nminus', 1e5)
simulator = circuit.simulator()
