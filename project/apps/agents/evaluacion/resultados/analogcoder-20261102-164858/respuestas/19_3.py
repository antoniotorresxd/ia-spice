from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias / input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)        # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0@u_V)    # tail / output current-source bias
circuit.V('ref', 'Vref', circuit.gnd, 2.5@u_V)      # non-inverting input reference (mid-supply)
circuit.V('in', 'Vin', circuit.gnd, 2.5@u_V)        # DC operating point of differentiator input
# First stage: NMOS differential pair with PMOS current-mirror load and NMOS tail
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Dm', 'Vn', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vo1', 'Vref', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('3', 'Dm', 'Dm', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('4', 'Vo1', 'Dm', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# Second stage: PMOS common-source with NMOS current-source load
circuit.MOSFET('6', 'Vout', 'Vo1', 'Vdd', 'Vdd', model='pmos_model', w=40e-6, l=1e-6)
circuit.MOSFET('7', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Miller compensation capacitor between first-stage output and op-amp output
circuit.C('c', 'Vo1', 'Vout', 2@u_pF)
# Differentiator feedback network
circuit.C('1', 'Vin', 'Vn', 1@u_nF)      # input capacitor C1
circuit.R('f', 'Vout', 'Vn', 100@u_kOhm) # feedback resistor Rf
# Analysis Part
simulator = circuit.simulator()
