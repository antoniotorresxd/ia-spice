from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)       # Positive supply
circuit.V('ss', circuit.gnd, 'Vss', 5.0)       # Negative supply (Vss node is -5V relative to gnd)
# Input Signals (DC bias values for operating point analysis)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)     # Vin1 = 1.0V
circuit.V('in2', 'Vin2', circuit.gnd, 2.0)     # Vin2 = 2.0V
# Resistors for Inverting Adder Topology
# Vout = -(Rf/R1)*Vin1 - (Rf/R2)*Vin2. Choosing R1 = R2 = Rf = 10k gives Vout = -(Vin1 + Vin2)
circuit.R('1', 'Vin1', 'V_inv', 10@u_kΩ)
circuit.R('2', 'Vin2', 'V_inv', 10@u_kΩ)
circuit.R('f', 'V_inv', 'Vout', 10@u_kΩ)
circuit.R('3', 'V_noninv', circuit.gnd, 3.33@u_kΩ)
# Ideal Op-Amp behavioral model implementation using VCVS (E-element)
# Gain is set very high (e.g., 1e5) to simulate an ideal operational amplifier
# E_name positive_output negative_output positive_input negative_input gain
circuit.BehavioralSource('opamp', 'Vout', circuit.gnd, 'V_noninv', 'V_inv', expression='100000 * (V(V_noninv) - V(V_inv))')
# Analysis Part
simulator = circuit.simulator()
