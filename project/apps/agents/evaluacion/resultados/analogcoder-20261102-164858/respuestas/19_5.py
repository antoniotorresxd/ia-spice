from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, lambda_=0.02)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, lambda_=0.02)
# Power and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 0.85@u_V)  # tail current bias
circuit.V('p', 'Vp', circuit.gnd, 2.5@u_V)         # non-inverting input at mid-supply
circuit.V('in', 'Vin', circuit.gnd, 2.5@u_V)       # differentiator input (DC operating point only)
# Op-amp core: five-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
# Input differential pair
circuit.MOSFET('1', 'Vd1', 'Vp', 'Vs', 'Vs', model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vm', 'Vs', 'Vs', model='nmos_model', w=20e-6, l=1e-6)
# PMOS current mirror active load
circuit.MOSFET('3', 'Vd1', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
# NMOS tail current source
circuit.MOSFET('5', 'Vs', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Differentiator feedback network
circuit.C('1', 'Vin', 'Vm', 1@u_nF)     # input capacitor C1
circuit.R('f', 'Vm', 'Vout', 100@u_kΩ)  # feedback resistor Rf
# Analysis Part
simulator = circuit.simulator()
