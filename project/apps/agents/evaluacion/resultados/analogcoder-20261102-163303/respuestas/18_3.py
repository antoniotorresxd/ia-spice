from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supplies and Input Signal Source
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # Positive power supply 5V
circuit.V('ss', 'Vss', circuit.gnd, 0.0) # Negative power supply (Ground)
circuit.V('in', 'Vin', circuit.gnd, 1.0) # DC input voltage to be integrated
# Passive Components for the Integrator
circuit.R('1', 'Vin', 'Vinv', 10@u_kΩ)
circuit.C('f', 'Vout', 'Vinv', 1@u_nF)
# Ideal Op-Amp Subcircuit Connection
# Opamp terminals: non-inverting (+), inverting (-), output (out)
# Non-inverting input is connected to gnd, inverting to 'Vinv', output to 'Vout'
circuit.subcircuit('ideal_opamp', 'plus', 'minus', 'out')
# Implementing a simple behavioral voltage-controlled voltage source for the op-amp
# E_opamp out gnd value = { A * (plus - minus) }
circuit.X('opamp', 'ideal_opamp', circuit.gnd, 'Vinv', 'Vout')
# Analysis Part
simulator = circuit.simulator()
