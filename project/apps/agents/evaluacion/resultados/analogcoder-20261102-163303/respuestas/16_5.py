from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# Power Supplies and Biasing
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.2) # DC bias voltage for the gate (V_th + excess = 0.5 + 0.7 = 1.2V)
# Common-Source Amplifier Stage
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=100e-6, l=1e-6)
circuit.R('L', 'Vout', 'Vdd', 2.2@u_kΩ) # Drain load resistor
# RC Phase-Shift Feedback Network (3 cascaded RC sections)
# Section 1
circuit.C('1', 'Vout', 'n1', 100@u_nF)
circuit.R('1', 'n1', circuit.gnd, 1@u_kΩ)
# Section 2
circuit.C('2', 'n1', 'n2', 100@u_nF)
circuit.R('2', 'n2', circuit.gnd, 1@u_kΩ)
# Section 3 (Feedback back to the amplifier input/gate node, replacing Vbias with the feedback path or AC coupling)
circuit.C('3', 'n2', 'Vbias', 100@u_nF)
circuit.R('3', 'Vbias', circuit.gnd, 1@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
