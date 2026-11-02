from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-inverting Schmitt Trigger')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 0.0)      # Input voltage (DC operating point)
circuit.V('bias', 'Vbias', circuit.gnd, 1.2)  # Bias for tail and output current sources
# Reference divider: Vref = 2.5 V
circuit.R('1', 'Vdd', 'Vref', 10e3)
circuit.R('2', 'Vref', circuit.gnd, 10e3)
# Positive feedback / input network
circuit.R('a', 'Vin', 'Vp', 10e3)   # Input resistor
circuit.R('f', 'Vout', 'Vp', 47e3)  # Positive feedback resistor
# Op-amp stage 1: NMOS differential pair with PMOS current-mirror load
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'D1', 'Vref', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'D2', 'Vp', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('3', 'D1', 'D1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('4', 'D2', 'D1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Op-amp stage 2: common-source output with NMOS current-source load
circuit.MOSFET('6', 'Vout', 'D2', 'Vdd', 'Vdd', model='pmos_model', w=40e-6, l=1e-6)
circuit.MOSFET('7', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Analysis Part
simulator = circuit.simulator()
