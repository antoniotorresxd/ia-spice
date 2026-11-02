from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # -5V negative power supply
# Input Signal Source
circuit.V('in', 'Vin', circuit.gnd, 1.0) # 1V DC input for operating point analysis
# Passives for Differentiator
circuit.C('1', 'Vin', 'InvertingNode', 1@u_uF)
circuit.R('f', 'InvertingNode', 'Vout', 10@u_kΩ)
# Op-Amp Configuration (using a behavioral voltage-controlled voltage source to model an ideal op-amp)
# Non-inverting input is connected to ground, Inverting input is at 'InvertingNode', Output is at 'Vout'
# Gain A = 100k
circuit.Vcvs('opamp', 'Vout', circuit.gnd, 'gnd', 'InvertingNode', 100e3)
# Analysis Part
simulator = circuit.simulator()
