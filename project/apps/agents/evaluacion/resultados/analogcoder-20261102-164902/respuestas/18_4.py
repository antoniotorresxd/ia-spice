from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# Supply and DC input for a defined operating point
circuit.V('dd', 'Vdd', circuit.gnd, 5.0 @ u_V)
circuit.V('in', 'Vin', circuit.gnd, 0.0 @ u_V)
# Inverting integrator network
circuit.R('1', 'Vin', 'Nsum', 10 @ u_kΩ)
circuit.C('f', 'Vout', 'Nsum', 10 @ u_nF)
# Idealized op-amp: Vout = A * (V+ - V-)
circuit.E('opamp', 'Vout', circuit.gnd, circuit.gnd, 'Nsum', voltage_gain=1e5)
simulator = circuit.simulator()
