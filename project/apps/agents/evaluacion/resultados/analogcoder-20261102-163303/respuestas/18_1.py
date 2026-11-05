from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Power Supplies for the circuit
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # -5V negative power supply
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 1.0) # 1V DC input signal source for operating point analysis
# Resistor and Capacitor for Integrator
# R1 connected between Vin and the inverting input (node 'V_inv')
circuit.R('1', 'Vin', 'V_inv', 10@u_kΩ)
# Cf (Feedback Capacitor) connected between Vout and the inverting input ('V_inv')
circuit.C('f', 'Vout', 'V_inv', 1@u_uF)
# Non-inverting input is connected to ground
# Using a subcircuit or behavioral model representation for an Op-Amp:
# We can model an ideal op-amp using a voltage-controlled voltage source (VCVS) or subcircuit,
# or use standard components for a simple simulation setup.
# Here we connect the non-inverting input to ground.
circuit.X('opamp', 'ideal_opamp', 'V_inv', circuit.gnd, 'Vout', 'Vdd', 'Vss')
# Analysis Part
simulator = circuit.simulator()
