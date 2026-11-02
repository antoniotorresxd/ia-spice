from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies for DC operating point
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('bias', 'Vbias', circuit.gnd, 4.0) # 4V bias for PMOS current source
circuit.V('gate_bias', 'Vgbias', circuit.gnd, 1.0) # 1V bias for NMOS gate
# Amplifier Stage: Common-Source with Active Load
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Vout', 'GateNode', circuit.gnd, circuit.gnd, model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vbias', 'Vdd', 'Vdd', model='pmos_model', w=100e-6, l=1e-6)
# Biasing resistor to set DC operating point at the gate of M1
circuit.R('bias', 'GateNode', 'Vgbias', 100@u_kΩ)
# RC Phase-Shift Feedback Network (3 stages)
# Stage 1
circuit.R('fb1', 'Vout', 'N1', 10@u_kΩ)
circuit.C('fb1', 'N1', circuit.gnd, 10@u_nF)
# Stage 2
circuit.R('fb2', 'N1', 'N2', 10@u_kΩ)
circuit.C('fb2', 'N2', circuit.gnd, 10@u_nF)
# Stage 3
circuit.R('fb3', 'N2', 'GateNode', 10@u_kΩ)
circuit.C('fb3', 'GateNode', circuit.gnd, 10@u_nF)
# Analysis Part
simulator = circuit.simulator()
