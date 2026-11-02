from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, **{'lambda': 0.02})
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, **{'lambda': 0.02})
# Power supply and DC input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 0.9)  # tail current bias (Vov ~ 0.4 V)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)    # subtrahend
circuit.V('in2', 'Vin2', circuit.gnd, 4.0)    # minuend (expected Vout = 3.0 V)
# Two-stage-free 5T OTA (op-amp core)
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'D1', 'Vn', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M1 inverting input
circuit.MOSFET('2', 'Vout', 'Vp', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6) # M2 non-inverting input
circuit.MOSFET('3', 'D1', 'D1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)          # M3 diode-connected load
circuit.MOSFET('4', 'Vout', 'D1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)        # M4 mirror output load
circuit.MOSFET('5', 'Tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M5 tail source
# Subtractor resistor network (all 10 kOhm)
circuit.R('1', 'Vin2', 'Vp', 10@u_kΩ)        # R1
circuit.R('2', 'Vp', circuit.gnd, 10@u_kΩ)   # R2
circuit.R('3', 'Vin1', 'Vn', 10@u_kΩ)        # R3
circuit.R('4', 'Vn', 'Vout', 10@u_kΩ)        # R4 feedback
# Analysis Part
simulator = circuit.simulator()
