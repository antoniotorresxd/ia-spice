from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and DC input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # tail bias = Vth + 0.5 V
circuit.V('in1', 'Vin1', circuit.gnd, 2.0)    # subtrahend
circuit.V('in2', 'Vin2', circuit.gnd, 4.0)    # minuend
# ---------------- Op-amp (5-transistor OTA) ----------------
# parameters: name, drain, gate, source, bulk, model, w, l
# Input differential pair (M1: non-inverting, M2: inverting)
circuit.MOSFET('1', 'Dn', 'Vp', 'Vtail', 'Vtail', model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vm', 'Vtail', 'Vtail', model='nmos_model', w=20e-6, l=1e-6)
# PMOS current mirror load (M3 diode-connected, M4 output)
circuit.MOSFET('3', 'Dn', 'Dn', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'Dn', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
# NMOS tail current source
circuit.MOSFET('5', 'Vtail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# ---------------- Subtractor resistor network ----------------
circuit.R('1', 'Vin1', 'Vm', 10@u_kΩ)     # R1
circuit.R('f', 'Vm', 'Vout', 10@u_kΩ)     # Rf (feedback)
circuit.R('2', 'Vin2', 'Vp', 10@u_kΩ)     # R2
circuit.R('g', 'Vp', circuit.gnd, 10@u_kΩ) # Rg
# Analysis Part
simulator = circuit.simulator()
