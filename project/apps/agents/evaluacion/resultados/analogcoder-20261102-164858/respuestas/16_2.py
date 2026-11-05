from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Model definitions
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# Power supply and DC bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 0.6)  # Gate bias = Vth + Vov = 0.5 + 0.1 V
# Common-source amplifier (inverting stage)
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Vout', 'Vminus', circuit.gnd, circuit.gnd,
               model='nmos_model', w=200e-6, l=1e-6)
circuit.R('D', 'Vdd', 'Vout', 30@u_kΩ)
# Three-section RC phase-shift feedback network (Vout -> Vminus)
circuit.C('1', 'Vout', 'n1', 680@u_pF)
circuit.R('1', 'n1', circuit.gnd, 100@u_kΩ)
circuit.C('2', 'n1', 'n2', 680@u_pF)
circuit.R('2', 'n2', circuit.gnd, 100@u_kΩ)
circuit.C('3', 'n2', 'Vminus', 680@u_pF)
circuit.R('3', 'Vminus', 'Vbias', 100@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
