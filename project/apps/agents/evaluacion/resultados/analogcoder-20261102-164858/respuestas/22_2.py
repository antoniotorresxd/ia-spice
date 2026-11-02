from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger with Positive Feedback')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)        # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.2@u_V)    # Tail current bias voltage
circuit.V('in', 'Vin', circuit.gnd, 0.0@u_V)        # Input node (DC operating point)
# Reference voltage divider (Vref = 2.5 V)
circuit.R('d1', 'Vdd', 'Vref', 100@u_kΩ)
circuit.R('d2', 'Vref', circuit.gnd, 100@u_kΩ)
# Op-amp (5-transistor OTA with single-ended output)
# MOSFET parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'N1', 'Vp', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M1: input (non-inverting)
circuit.MOSFET('2', 'Vout', 'Vref', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6) # M2: input (inverting)
circuit.MOSFET('3', 'N1', 'N1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)          # M3: diode-connected load
circuit.MOSFET('4', 'Vout', 'N1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)        # M4: mirror output
circuit.MOSFET('5', 'Tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M5: tail source
# Positive feedback network
circuit.R('1', 'Vin', 'Vp', 100@u_kΩ)    # R1: input resistor
circuit.R('f', 'Vout', 'Vp', 240@u_kΩ)   # Rf: positive feedback resistor
# Analysis Part
simulator = circuit.simulator()
