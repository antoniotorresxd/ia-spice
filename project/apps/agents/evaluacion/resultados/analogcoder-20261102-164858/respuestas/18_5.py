from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # Tail bias: Vth + Vov = 0.5 + 0.5 = 1.0 V
circuit.V('cm', 'Vp', circuit.gnd, 2.5)       # Non-inverting reference (mid-supply)
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # Input node, DC operating point only
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Dm', 'Vp', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vminus', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('3', 'Dm', 'Dm', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'Dm', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Integrator network
circuit.R('1', 'Vin', 'Vminus', 100@u_kΩ)     # Input resistor R1
circuit.C('f', 'Vminus', 'Vout', 10@u_pF)     # Feedback capacitor Cf
circuit.R('f', 'Vminus', 'Vout', 10@u_MΩ)     # DC feedback resistor (sets DC bias)
# Analysis Part
simulator = circuit.simulator()
