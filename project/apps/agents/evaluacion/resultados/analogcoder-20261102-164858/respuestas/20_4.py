from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supplies (Vdd = 5 V, Vss = -5 V for negative output swing)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# Bias voltage for tail current source (Vss + Vth + Vov = -5 + 0.5 + 0.3 = -4.2 V)
circuit.V('bias', 'Vbias', circuit.gnd, -4.2)
# Input signals (DC only)
circuit.V('in1', 'Vin1', circuit.gnd, 0.2)
circuit.V('in2', 'Vin2', circuit.gnd, 0.1)
# Op-amp core: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'd1', circuit.gnd, 'tail', 'tail', model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vinv', 'tail', 'tail', model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('3', 'd1', 'd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('5', 'tail', 'Vbias', 'Vss', 'Vss', model='nmos_model', w=40e-6, l=1e-6)
# Summing (inverting) network: Vout = -(Vin1 + Vin2)
circuit.R('1', 'Vin1', 'Vinv', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vinv', 10@u_kΩ)
circuit.R('f', 'Vout', 'Vinv', 10@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
