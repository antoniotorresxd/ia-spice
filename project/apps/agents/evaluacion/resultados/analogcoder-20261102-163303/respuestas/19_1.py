from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Power Supplies and Input Signal
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('in', 'Vin', circuit.gnd, 1.0) # 1V DC input voltage for operating point analysis
# Define the op-amp using a VCVS (Voltage-Controlled Voltage Source) with high gain (A = 1e5)
# Syntax: E(name, positive_output, negative_output, positive_input, negative_input, gain)
# Non-inverting input is connected to gnd, inverting input is connected to 'V_inv'
circuit.VCVS('opamp', 'Vout', circuit.gnd, circuit.gnd, 'V_inv', 1e5)
# Differentiator Components: Capacitor C1 at input, Resistor Rf in feedback
circuit.C('1', 'Vin', 'V_inv', 1@u_uF)
circuit.R('f', 'V_inv', 'Vout', 100@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
