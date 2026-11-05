from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# Single-supply rail
circuit.V('dd', 'Vdd', circuit.gnd, 5.0 @ u_V)
# Mid-supply reference: Vref = 2.5 V
circuit.R('ref1', 'Vdd', 'Vref', 100 @ u_kΩ)
circuit.R('ref2', 'Vref', circuit.gnd, 100 @ u_kΩ)
# DC input bias for operating-point analysis
circuit.V('in', 'Vin', circuit.gnd, 2.5 @ u_V)
# Integrator input resistor and feedback capacitor
circuit.R('1', 'Vin', 'Vminus', 10 @ u_kΩ)
circuit.C('f', 'Vout', 'Vminus', 100 @ u_nF)
# Finite-gain op-amp model.
# Its output is referenced to Vref; the control voltage is Vref - Vminus.
circuit.VCVS('A1', 'Vout', 'Vref', 'Vref', 'Vminus', 1e6)
simulator = circuit.simulator()
