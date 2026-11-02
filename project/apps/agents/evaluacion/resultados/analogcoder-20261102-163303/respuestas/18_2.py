from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # Positive supply
circuit.V('ss', circuit.gnd, 'Vee', 5.0) # Negative supply (creates -5V at Vee relative to gnd)
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 1.0) # DC input voltage for operating point
# Resistor and Capacitor for the Integrator
# R1 connected between Vin and inverting input (Vinv)
circuit.R('1', 'Vin', 'Vinv', 10@u_kΩ)
# Cf connected between Vout and inverting input (Vinv)
circuit.C('f', 'Vout', 'Vinv', 1@u_nF)
# Operational Amplifier Subcircuit / Behavioral implementation using VCVS
# E(name, positive_output, negative_output, positive_input, negative_input, gain)
# Non-inverting input is connected to gnd, inverting input is Vinv
circuit.SinusoidalVoltageSource('opamp_ref', 'Vinv', circuit.gnd, dc=0) # dummy ground reference for non-inverting input
circuit.X('opamp', 'ideal_opamp', 'Vinv', circuit.gnd, 'Vout', 'Vdd', 'Vee')
# Defining a simple subcircuit for an ideal Op-Amp with high gain
circuit.subcircuit('ideal_opamp', 'nin', 'pin', 'out', 'vdd', 'vee')
circuit.E('gain', 'out', circuit.gnd, 'pin', 'nin', 100000)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
