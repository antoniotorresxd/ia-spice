from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Power Supplies for the op-amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('ss', 'Vss', circuit.gnd, 0.0) # Ground supply
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 2.5) # 2.5V DC input for operating point analysis
# Reference Voltage for the Inverting Terminal (Mid-supply: 2.5V)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# Resistors for Positive Feedback and Input Divider
# R1 connects Vin to the non-inverting terminal (V_plus)
# R2 connects Vout to the non-inverting terminal (V_plus)
circuit.R('1', 'Vin', 'V_plus', 10@u_kΩ)
circuit.R('2', 'Vout', 'V_plus', 100@u_kΩ)
# Behavioral or Subcircuit-based Op-Amp implementation for DC/Operating Point analysis
# Using a voltage-controlled voltage source (E) with high gain to model an ideal op-amp
# E_amp output, ground, plus_input, minus_input, gain
circuit.X('opamp', 'opamp_ideal', 'V_plus', 'Vref', 'Vout', 'Vdd', 'Vss')
# Subcircuit definition for the ideal op-amp using VCVS
circuit.subcircuit('opamp_ideal', ['plus', 'minus', 'out', 'vdd', 'vss'])
circuit.subcircuit_netlist.V('supply_pos', 'vdd_int', 'vdd', 0)
# E-element: name, positive_node, negative_node, controlling_positive, controlling_negative, gain
circuit.subcircuit_netlist.E('amp', 'out_unclipped', circuit.gnd, 'plus', 'minus', 1e5)
# Simple clamping to power rails for the op-amp output
circuit.subcircuit_netlist.R('out_limit1', 'out_unclipped', 'vdd', 1)
circuit.subcircuit_netlist.R('out_limit2', 'out_unclipped', 'vss', 1)
circuit.subcircuit_netlist.R('out_load', 'out_unclipped', 'out', 1e-3)
circuit.ends()
# Analysis Part
simulator = circuit.simulator()
