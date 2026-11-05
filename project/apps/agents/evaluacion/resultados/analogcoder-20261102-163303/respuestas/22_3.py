from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Define power supplies for a dual-supply op-amp (+5V and -5V)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# Define input signal source (e.g., DC operating point or sweep input)
circuit.V('in', 'Vin', circuit.gnd, 0.0)
# Resistors for the positive feedback hysteresis network
# R1 connects Vin to the non-inverting input (V_plus)
# R2 connects Vout to the non-inverting input (V_plus)
circuit.R('1', 'Vin', 'V_plus', 10@u_kΩ)
circuit.R('2', 'Vout', 'V_plus', 100@u_kΩ)
# The inverting input (V_minus) is connected to ground
# We use a high-gain Voltage Controlled Voltage Source (VCVS) to model the op-amp
# E_amp output_node ref_node positive_input_node negative_input_node gain
circuit.E('opamp', 'Vout_internal', circuit.gnd, 'V_plus', circuit.gnd, 100000)
# Output limiting / rail saturation circuit using diodes or a smooth limiting function, 
# or simple resistor divider to clamp the output between Vdd (5V) and Vss (-5V)
# For simplicity in standard spice behavioral modeling:
circuit.R('out_limit', 'Vout_internal', 'Vout', 1@u_Ω)
circuit.D('pos_limit', 'Vdd', 'Vout', model='ideal')
circuit.D('neg_limit', 'Vout', 'Vss', model='ideal')
# Define ideal diode model for output rail clamping
circuit.model('ideal', 'd', is_=1e-15, vj=0.6)
# Analysis Part
simulator = circuit.simulator()
