from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Define the MOSFET model
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# Power Supplies and Bias
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0) # 1V bias voltage for M1 gate (= V_th + 0.5 = 0.5 + 0.5)
# Common-Source Amplifier Stage
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Vout', 'Gate_Node', circuit.gnd, circuit.gnd, model='nmos_model', w=100e-6, l=1e-6)
circuit.R('1', 'Vout', 'Vdd', 5.0@u_kΩ)
# Biasing Resistor for Gate
circuit.R('bias_res', 'Gate_Node', 'Vbias', 100.0@u_kΩ)
# 3-Stage RC Phase-Shift Network (Feedback Loop from Vout to Gate_Node)
circuit.R('fb1', 'Vout', 'N1', 1.0@u_kΩ)
circuit.C('1', 'N1', circuit.gnd, 100.0@u_nF)
circuit.R('fb2', 'N1', 'N2', 1.0@u_kΩ)
circuit.C('2', 'N2', circuit.gnd, 100.0@u_nF)
circuit.R('fb3', 'N2', 'Gate_Node', 1.0@u_kΩ)
circuit.C('3', 'Gate_Node', circuit.gnd, 100.0@u_nF)
# Analysis Part
simulator = circuit.simulator()
