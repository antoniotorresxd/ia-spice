from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Power Supplies for the opamp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)   # +5V power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0)  # -5V power supply
# Input Signal Source (DC operating point analysis input)
circuit.V('in', 'Vin', circuit.gnd, 1.0)   # 1V DC input signal source
# Differentiator Passive Components
# Capacitor C1 connected between Vin and the inverting input (node 'V_inv')
circuit.C('1', 'Vin', 'V_inv', 1@u_uF)
# Feedback Resistor Rf connected between inverting input ('V_inv') and Vout
circuit.R('f', 'V_inv', 'Vout', 100@u_kΩ)
# Non-inverting input connected to ground (0V)
# We model the operational amplifier using a Voltage-Controlled Voltage Source (VCVS)
# Syntax: E(name, positive_output, negative_output, positive_input, negative_input, gain)
# Positive input: gnd (0V), Negative input: V_inv, Output: Vout, Gain: 100000
circuit.E('opamp', 'Vout', circuit.gnd, circuit.gnd, 'V_inv', 100000)
# Analysis Part
simulator = circuit.simulator()
