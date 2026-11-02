from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Power Supplies for the Op-Amp (Dual Supply)
circuit.V('cc', 'Vcc', circuit.gnd, 15@u_V)
circuit.V('ee', 'Vee', circuit.gnd, -15@u_V)
# Wien Bridge Feedback Network Components
# Series RC branch connected between Vout and non-inverting input (node 'V_plus')
circuit.R('s', 'Vout', 'V_plus', 10@u_kΩ)
circuit.C('s', 'V_plus', 'Node_Series', 10@u_nF)
# Parallel RC branch connected between non-inverting input (node 'V_plus') and ground
circuit.R('p', 'Node_Series', circuit.gnd, 10@u_kΩ)
circuit.C('p', 'Node_Series', circuit.gnd, 10@u_nF)
# Op-Amp Non-Inverting Input Bias / Connection
# (Connecting the series capacitor to the parallel resistor node)
# Note: Node_Series is the node between Cs and Rp.
# Inverting Gain Network (Setting gain to slightly greater than 3, e.g., Rf = 20k, Rg = 10k -> Av = 3)
circuit.R('f', 'Vout', 'V_minus', 20@u_kΩ)
circuit.R('g', 'V_minus', circuit.gnd, 10@u_kΩ)
# Behavioral/Ideal Op-Amp Implementation using Controlled Sources for simulation
# Output voltage = Gain * (V+ - V-)
# Using a high gain differential voltage source to model the op-amp
circuit.VCVS('opamp', 'Vout', circuit.gnd, 'V_plus', 'V_minus', 1e5)
# Analysis Part
simulator = circuit.simulator()
