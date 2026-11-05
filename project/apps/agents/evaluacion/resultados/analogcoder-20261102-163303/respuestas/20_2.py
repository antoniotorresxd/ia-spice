from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Power Supplies for the op-amp
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)   # +5V power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0)  # -5V power supply
# Input Signal Sources for testing the operating point
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)  # 1V DC input 1
circuit.V('in2', 'Vin2', circuit.gnd, 2.0)  # 2V DC input 2
# Resistors for the Inverting Summer
# Choosing R1 = R2 = Rf = 10k ohms to get Vout = -(Vin1 + Vin2)
circuit.R('1', 'Vin1', 'Vminus', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vminus', 10@u_kΩ)
circuit.R('f', 'Vout', 'Vminus', 10@u_kΩ)
# Non-inverting terminal connected to ground
circuit.R('ground_ref', 'Vplus', circuit.gnd, 1@u_Ω)
# Behavioral model of an Ideal Op-Amp
# E-source (Voltage-Controlled Voltage Source) representing high-gain op-amp: Vout = A * (V+ - V-)
# Using a high gain A = 1e5
circuit.Vcr('opamp', 'Vout_internal', circuit.gnd, 'Vplus', 'Vminus', 100000)
# Adding a small output resistance or direct connection
circuit.R('out', 'Vout_internal', 'Vout', 1@u_Ω)
# Analysis Part
simulator = circuit.simulator()
