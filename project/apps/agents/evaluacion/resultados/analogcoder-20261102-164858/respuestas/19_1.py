from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, lambda_=0.05)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, lambda_=0.05)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('cm', 'Vcm', circuit.gnd, 2.5)      # common-mode bias for non-inverting input
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # NMOS bias: V_th + 0.5 V
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # DC input level (no AC source)
# Op-amp stage 1: NMOS differential pair with PMOS mirror load
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Node1', 'Vcm', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('2', 'Node2', 'Vminus', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('3', 'Node1', 'Node1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Node2', 'Node1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('5', 'Tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Op-amp stage 2: PMOS common-source with NMOS current-source load
circuit.MOSFET('6', 'Vout', 'Node2', 'Vdd', 'Vdd', model='pmos_model', w=40e-6, l=1e-6)
circuit.MOSFET('7', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Differentiator network
circuit.C('1', 'Vin', 'Vminus', 1@u_nF)     # input capacitor C1
circuit.R('f', 'Vout', 'Vminus', 10@u_kΩ)   # feedback resistor Rf
# Analysis Part
simulator = circuit.simulator()
