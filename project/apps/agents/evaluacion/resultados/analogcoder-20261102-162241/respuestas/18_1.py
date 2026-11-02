from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supplies for the Op-Amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)   # +5V power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0)  # -5V power supply
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 1.0)   # 1V DC input for operating point / integration test
# Integrator Components
# R1 connected between Vin and the inverting input (node 'Vx')
circuit.R('1', 'Vin', 'Vx', 10@u_kΩ)
# Cf (feedback capacitor) connected between the output (Vout) and the inverting input (node 'Vx')
circuit.C('f', 'Vx', 'Vout', 1@u_uF)
# Non-inverting input connected to ground (node 'V_non_inv' connected to gnd)
# We model the Op-Amp using a behavioral voltage source (VCVS) with high gain (A = 100k)
# E_opamp output_node positive_input negative_input voltage_gain
circuit.Sinusoidal('offset', 'V_non_inv', circuit.gnd, amplitude=0, frequency=1) # dummy or ground reference
# Connecting non-inverting input to ground directly:
# Let's use a subcircuit or behavioral source for the op-amp:
# Vout = A * (V_non_inv - V_inverting) => Vout = 100k * (0 - Vx)
circuit.V('opamp', 'Vout_internal', circuit.gnd, 0) # reference
# Using a VCVS (E element in SPICE): E1 Vout gnd v_pos v_neg gain
circuit.element_factory('E')('opamp', 'Vout', circuit.gnd, circuit.gnd, 'Vx', 100000.0)
# Analysis Part
simulator = circuit.simulator()
