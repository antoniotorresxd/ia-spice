from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('ref', 'Vref', circuit.gnd, 2.5) # 2.5V reference voltage
circuit.V('in', 'Vin', circuit.gnd, 2.5) # Input signal set at 2.5V for operating point
# Resistors for positive feedback network (hysteresis setting)
circuit.R('1', 'Vout', 'Vplus', 10@u_kΩ)
circuit.R('2', 'Vplus', 'Vref', 10@u_kΩ)
# Behavioral or idealized Op-Amp implementation using a voltage-controlled voltage source (VCVS)
# E_name positive_output negative_output positive_input negative_input gain
# Here, input nodes are Vplus (non-inverting) and Vin (inverting). Output is Vout_int, clipped between 0 and 5V.
# For simplicity in PySpice DC operating point, a high-gain linear amplifier model can be used:
circuit.V('opamp_out', 'Vout_internal', circuit.gnd, 0) # Placeholder, replaced by VCVS:
# Using a VCVS with a large gain (e.g., 100k) to emulate an op-amp:
# E.g., E1 Vout gnd value = { 2.5 + 100000 * (V(Vplus) - V(Vin)) } with limiting
# PySpice allows behavioral sources using expression:
circuit.BehavioralSource('opamp', 'Vout', circuit.gnd,
                         expression='min(5.0, max(0.0, 2.5 + 100000 * (V(Vplus) - V(Vin))))')
# Analysis Part
simulator = circuit.simulator()
