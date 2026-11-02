from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)  # Positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # Negative power supply
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 1.0)  # DC input voltage for operating point analysis
# Resistor R1 connected between Vin and the inverting input (Vinv)
circuit.R('1', 'Vin', 'Vinv', 10@u_kΩ)
# Feedback Capacitor Cf connected between Vout and the inverting input (Vinv)
circuit.C('f', 'Vout', 'Vinv', 100@u_nF)
# Non-inverting terminal connected to ground
# Using a behavioral voltage source to model an ideal Op-Amp
# E-source: name, positive_output, negative_output, positive_input, negative_input, gain
# Here, gain is very large (e.g., 100k) to approximate an ideal operational amplifier.
# Non-inverting input is at gnd, inverting input is at Vinv.
circuit.Sin('opamp_output', 'Vout', circuit.gnd, 100000)
# We can model the op-amp using a subcircuit or a controlled source. 
# For PySpice compatibility using controlled sources:
# E.g., Vout = A * (V_non_inv - V_inv) = A * (0 - Vinv)
circuit.X('opamp', 'opamp_subcircuit', 'Vout', circuit.gnd, 'Vinv')
# Define the Op-Amp subcircuit in the netlist
circuit.subcircuit(Circuit('opamp_subcircuit', 'out', 'non_inv', 'inv'))
# Inside subcircuit: Output is controlled by (non_inv - inv)
circuit.vcvs('1', 'out', circuit.gnd, 'non_inv', 'inv', 1e6)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
