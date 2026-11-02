from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Define MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('in', 'Vin', circuit.gnd, 2.5) # 2.5V DC input voltage
circuit.V('ref', 'Vref', circuit.gnd, 2.5) # 2.5V reference voltage for non-inverting terminal
# Bias current source reference
circuit.V('bias', 'Vbias', circuit.gnd, 1.5)
# Op-Amp Sub-circuit Implementation (Two-Stage Op-Amp)
# Differential Input Stage
circuit.MOSFET('1', 'DiffOut', 'Vref', 'Tail', 'Tail', model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'Vinv', 'Vinv', 'Tail', 'Tail', model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('tail', 'Tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=50e-6, l=1e-6)
# Active Load for Differential Pair
circuit.MOSFET('3', 'DiffOut', 'DiffOut', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('4', 'Vinv', 'DiffOut', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
# Second Stage (Common-Source Amplifier)
circuit.MOSFET('5', 'Vout', 'Vinv', circuit.gnd, circuit.gnd, model='nmos_model', w=100e-6, l=1e-6)
circuit.MOSFET('6', 'Vout', 'Vbias2', 'Vdd', 'Vdd', model='pmos_model', w=200e-6, l=1e-6)
circuit.V('bias2', 'Vbias2', circuit.gnd, 3.5)
# External Differentiator Components (Capacitor C1 and Resistor Rf)
circuit.C('1', 'Vin', 'Vinv', 1@u_uF)
circuit.R('f', 'Vinv', 'Vout', 10@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
