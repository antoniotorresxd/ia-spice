from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# DC input value for operating-point analysis
circuit.V('in', 'Vin', circuit.gnd, 0 @ u_V)
# Inverting integrator network
circuit.R('1', 'Vin', 'Ninv', 10 @ u_kΩ)
circuit.C('f', 'Ninv', 'Vout', 10 @ u_nF)
# High-gain op-amp macromodel:
# Vout = gain * (Vnoninverting - Vinverting)
circuit.VCVS('opamp', 'Vout', circuit.gnd, circuit.gnd, 'Ninv', 1e5)
simulator = circuit.simulator()
