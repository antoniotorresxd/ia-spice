from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Power Supplies for the op-amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # -5V negative power supply
# Input Signal Sources
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # 1V DC input 1
circuit.V('in2', 'Vin2', circuit.gnd, 2.0) # 2V DC input 2
# Resistors for Inverting Summing Amplifier
# R1 for Vin1, R2 for Vin2, Rf for feedback
circuit.R('1', 'Vin1', 'V_inv', 10@u_kΩ)
circuit.R('2', 'Vin2', 'V_inv', 10@u_kΩ)
circuit.R('f', 'V_inv', 'Vout', 10@u_kΩ)
circuit.R('3', 'V_noninv', circuit.gnd, 10@u_kΩ)
# Behavioral Op-Amp implementation using a Voltage-Controlled Voltage Source (VCSS / E-element)
# Syntax: E(name, positive_output, negative_output, positive_input, negative_input, gain)
# Gain is set high (e.g., 100k) to emulate an ideal operational amplifier.
circuit.SinusoidalVoltageSource('opamp_behavioral', 'Vout', circuit.gnd, dc=0) # Placeholder for structural completeness
# Using standard PySpice non-linear/behavioral or simple VCVS for op-amp:
# Node connections: Non-inverting input ('V_noninv'), Inverting input ('V_inv'), Output ('Vout')
circuit.element('E1').plus = 'Vout'
circuit.element('E1').minus = circuit.gnd
circuit.element('E1').input_plus = 'V_noninv'
circuit.element('E1').input_minus = 'V_inv'
circuit.element('E1').gain = 1e5
# Analysis Part
simulator = circuit.simulator()
