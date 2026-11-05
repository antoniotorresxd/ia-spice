from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and DC input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 4.2)  # tail bias: Vdd - |Vth| - ~0.3 V overdrive
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)    # subtrahend
circuit.V('in2', 'Vin2', circuit.gnd, 2.0)    # minuend (expected Vout = 1.0 V)
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
# M1: non-inverting input (gate = Vp)
circuit.MOSFET('1', 'Dm', 'Vp', 'Ntail', 'Ntail', model='pmos_model', w=20e-6, l=1e-6)
# M2: inverting input (gate = Vn), output drain = Vout
circuit.MOSFET('2', 'Vout', 'Vn', 'Ntail', 'Ntail', model='pmos_model', w=20e-6, l=1e-6)
# M3: PMOS tail current source
circuit.MOSFET('3', 'Ntail', 'Vbias', 'Vdd', 'Vdd', model='pmos_model', w=40e-6, l=1e-6)
# M4: diode-connected NMOS mirror reference
circuit.MOSFET('4', 'Dm', 'Dm', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# M5: NMOS mirror output
circuit.MOSFET('5', 'Vout', 'Dm', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# Subtractor resistor network (all 10 kOhm)
circuit.R('a', 'Vin1', 'Vn', 10@u_kΩ)   # Ra: Vin1 -> inverting node
circuit.R('f', 'Vn', 'Vout', 10@u_kΩ)   # Rf: feedback from output
circuit.R('b', 'Vin2', 'Vp', 10@u_kΩ)   # Rb: Vin2 -> non-inverting node
circuit.R('g', 'Vp', circuit.gnd, 10@u_kΩ)  # Rg: non-inverting node to ground
# Analysis Part
simulator = circuit.simulator()
