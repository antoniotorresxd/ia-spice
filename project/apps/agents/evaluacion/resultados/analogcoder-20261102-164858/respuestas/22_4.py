from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supplies and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # tail-current bias (Vth + 0.5 V)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)    # reference = Vdd/2
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # DC input for operating point
# Five-transistor OTA (op-amp core)
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Nd1', 'Vin', 'Vtail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M1 (+ input)
circuit.MOSFET('2', 'Vout', 'Vm', 'Vtail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M2 (- input)
circuit.MOSFET('3', 'Nd1', 'Nd1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)           # M3 diode load
circuit.MOSFET('4', 'Vout', 'Nd1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)          # M4 mirror output
circuit.MOSFET('5', 'Vtail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=40e-6, l=1e-6)  # M5 tail
# Positive feedback network (non-inverting Schmitt configuration)
circuit.R('f', 'Vout', 'Vm', 10@u_kΩ)   # Rf
circuit.R('g', 'Vm', 'Vref', 10@u_kΩ)   # Rg
# Analysis Part
simulator = circuit.simulator()
