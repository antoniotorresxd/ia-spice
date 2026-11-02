from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Differentiator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias/input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)     # 5 V supply
circuit.V('cm', 'Vcm', circuit.gnd, 2.5)     # Non-inverting input bias (mid-supply)
circuit.V('b', 'Vb', circuit.gnd, 1.0)       # Tail current source bias (V_th + 0.5 V)
circuit.V('in', 'Vin', circuit.gnd, 2.5)     # Differentiator input (DC operating point)
# Op-amp (5-transistor OTA)
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'd1', 'Vcm', 'tail', 'tail', model='nmos_model', w=10e-6, l=1e-6)   # M1 input
circuit.MOSFET('2', 'Vout', 'Vinv', 'tail', 'tail', model='nmos_model', w=10e-6, l=1e-6) # M2 input
circuit.MOSFET('5', 'tail', 'Vb', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6) # M5 tail
circuit.MOSFET('3', 'd1', 'd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)   # M3 diode load
circuit.MOSFET('4', 'Vout', 'd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6) # M4 mirror load
# Differentiator network
circuit.C('1', 'Vin', 'Vinv', 1@u_nF)       # C1 = 1 nF
circuit.R('f', 'Vinv', 'Vout', 10@u_kΩ)     # Rf = 10 kΩ
# Analysis Part
simulator = circuit.simulator()
